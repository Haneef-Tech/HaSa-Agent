import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  apiKeyFor,
  configPath,
  getProvider,
  listProviderIds,
  loadConfig,
  onlyChatModels,
  redact,
  readCache,
  saveConfig,
  writeCache,
  type ChatMessage,
  type ModelInfo,
} from "hasa-core";

export interface SlashHelpers {
  provider: string;
  setProvider: (p: string) => void;
  setModel: (m: string) => void;
  setModels: (m: ModelInfo[]) => void;
  newSession: () => void;
  takeChoices: () => ModelInfo[];
  stashChoices: (c: ModelInfo[]) => void;
}

export interface SlashResult {
  handled: boolean;
  replies: ChatMessage[];
}

/** Pure parse — `/model foo` → { name: "model", args: ["foo"] }. Null when not a slash command. */
export function parseSlash(input: string): { name: string; args: string[] } | null {
  if (!input.startsWith("/")) return null;
  const parts = input.slice(1).trim().split(/\s+/).filter((p) => p.length > 0);
  const name = (parts.shift() ?? "").toLowerCase();
  if (!name) return null;
  return { name, args: parts };
}

export const SLASH_HELP = `Slash commands:
  /model               list models from ALL providers that have keys
  /model <n|id|text>   switch model AND provider together — e.g. /model 3, /model gemini
  /models              list models for the current provider only
  /key <api-key>       save API key for the current provider
  /key <provider> <api-key>  save key for a specific provider
  /provider <id>       switch provider (nara, zen, gemini, anthropic, groq, openai-compatible)
  /read <path>          read a workspace file into chat (e.g. /read src/index.ts)
  /config              show provider/model/key status (keys redacted)
  /new                 start a new session
  /help                this help`;

function asst(text: string): ChatMessage {
  return { role: "assistant", content: text };
}

async function fetchChoices(provider: string): Promise<ModelInfo[]> {
  const cfg = await loadConfig();
  const key = apiKeyFor(cfg, provider);
  if (!key) throw new Error(`No API key for ${provider}. Use /key <api-key> or run \`hasa setup\`.`);
  const p = getProvider(provider, cfg.providers?.[provider]?.baseUrl);
  const cached = await readCache(provider);
  if (cached && cached.models.length > 0) return onlyChatModels(cached.models);
  const all = await p.listModels(key, cfg.providers?.[provider]?.baseUrl);
  const free = all.filter((m) => m.isFree);
  const choices = onlyChatModels(free.length > 0 ? free : all).slice(0, 20);
  await writeCache(provider, choices);
  return choices;
}

export function formatChoices(choices: ModelInfo[], current: string): string {
  const shown = choices.slice(0, 15);
  const lines = shown.map((m, i) => `  ${i + 1}. ${m.id}${m.isFree ? "  [Free]" : ""}${m.id === current ? "  <-- current" : ""}`);
  const more = choices.length > shown.length ? `\n  +${choices.length - shown.length} more — refine with /model <text>` : "";
  return `Free models:\n${lines.join("\n")}${more}\nSwitch with: /model <number>  or  /model <part-of-id>`;
}

async function selectModel(m: ModelInfo, h: SlashHelpers): Promise<string> {
  const cfg = await loadConfig();
  cfg.provider = m.provider;
  cfg.model = m.id;
  await saveConfig(cfg);
  h.setProvider(m.provider);
  h.setModel(m.id);
  return `Switched to ${m.provider} / ${m.id}${m.isFree ? "  [Free]" : ""} — saved.`;
}

/** Fetch with a hard timeout so one slow router can't hang /model. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([p.finally(() => { if (timer) clearTimeout(timer); }), timeout]);
}

interface ProviderChoices {
  provider: string;
  models: ModelInfo[];
}

/** Models from every provider that has a key saved (cache first, live fallback). */
async function fetchAllChoices(): Promise<{ groups: ProviderChoices[]; missingKey: string[] }> {
  const cfg = await loadConfig();
  const groups: ProviderChoices[] = [];
  const missingKey: string[] = [];
  await Promise.all(
    listProviderIds().map(async (id) => {
      const key = apiKeyFor(cfg, id);
      if (!key) {
        missingKey.push(id);
        return;
      }
      try {
        const cached = await readCache(id);
        if (cached && cached.models.length > 0) {
          groups.push({ provider: id, models: onlyChatModels(cached.models).map((m) => ({ ...m, provider: id })) });
          return;
        }
        const p = getProvider(id, cfg.providers?.[id]?.baseUrl);
        const all = await withTimeout(p.listModels(key, cfg.providers?.[id]?.baseUrl), 15000, id);
        const free = all.filter((m) => m.isFree);
        const choices = onlyChatModels(free.length > 0 ? free : all).slice(0, 20);
        if (choices.length > 0) {
          await writeCache(id, choices);
          groups.push({ provider: id, models: choices.map((m) => ({ ...m, provider: id })) });
        }
      } catch {
        // Skip failed providers — summary tells the user which had keys.
      }
    }),
  );
  groups.sort((a, b) => a.provider.localeCompare(b.provider));
  return { groups, missingKey };
}

/** `/model` — all providers with keys, grouped. Picking switches provider+model together. */
async function cmdModel(args: string[], h: SlashHelpers): Promise<ChatMessage[]> {
  if (args.length === 0) {
    const { groups, missingKey } = await fetchAllChoices();
    const flat = groups.flatMap((g) => g.models.slice(0, 10));
    if (flat.length === 0) {
      const hint = missingKey.length > 0 ? ` No keys saved for: ${missingKey.join(", ")} — add one with /key <provider> <api-key>.` : " Check your keys with /config.";
      return [asst(`No models found.${hint}`)];
    }
    h.stashChoices(flat);
    h.setModels(flat);
    const cfg = await loadConfig();
    let n = 0;
    const lines: string[] = [];
    for (const g of groups) {
      lines.push(`[${g.provider}]`);
      for (const m of g.models.slice(0, 10)) {
        n += 1;
        const cur = m.id === cfg.model && m.provider === cfg.provider ? "  <-- current" : "";
        lines.push(`  ${n}. ${m.id}${m.isFree ? "  [Free]" : ""}${cur}`);
      }
    }
    return [asst(`Models (all providers):\n${lines.join("\n")}\nSwitch with: /model <number>  or  /model <part-of-id>`)];
  }
  const first = args[0] as string;
  // Numeric pick from the last list (provider switches along with the model).
  if (/^\d+$/.test(first)) {
    const choices = h.takeChoices();
    const n = Number(first);
    if (choices.length === 0) return [asst("No model list yet — run /model first, then /model <number>.")];
    if (n < 1 || n > choices.length) return [asst(`Pick 1–${choices.length}.`)];
    const chosen = choices[n - 1] as ModelInfo;
    return [asst(await selectModel(chosen, h))];
  }
  // Text search across stashed list, else across all providers.
  const query = args.join(" ").toLowerCase();
  let choices = h.takeChoices().filter((m) => m.id.toLowerCase().includes(query));
  if (choices.length === 0) {
    const { groups } = await fetchAllChoices();
    choices = groups.flatMap((g) => g.models).filter((m) => m.id.toLowerCase().includes(query));
  }
  if (choices.length === 0) return [asst(`No model matching "${query}". Run /model to see everything.`)];
  if (choices.length === 1) return [asst(await selectModel(choices[0] as ModelInfo, h))];
  h.stashChoices(choices);
  return [asst(`Multiple matches:\n${choices.map((m, i) => `  ${i + 1}. [${m.provider}] ${m.id}`).join("\n")}\nPick with /model <number>.`)];
}

/** `/models` — current provider only. */
async function cmdModelsCurrent(h: SlashHelpers): Promise<ChatMessage[]> {
  const cfg = await loadConfig();
  try {
    const choices = (await fetchChoices(cfg.provider)).map((m) => ({ ...m, provider: cfg.provider }));
    h.stashChoices(choices);
    h.setModels(choices);
    return [asst(formatChoices(choices, cfg.model))];
  } catch (err) {
    return [asst(`Error: ${err instanceof Error ? err.message : String(err)}`)];
  }
}

async function cmdKey(args: string[], h: SlashHelpers): Promise<ChatMessage[]> {
  const ids = listProviderIds();
  let provider = h.provider;
  let key = "";
  if (args.length === 1) {
    key = args[0] as string;
  } else if (args.length === 2) {
    provider = (args[0] as string).toLowerCase();
    key = args[1] as string;
  } else {
    return [asst("Usage: /key <api-key>  or  /key <provider> <api-key>  (key is never echoed back)")];
  }
  if (!ids.includes(provider)) return [asst(`Unknown provider "${provider}". Known: ${ids.join(", ")}`)];
  if (key.length < 8) return [asst("That key looks too short — paste the full key.")];
  const cfg = await loadConfig();
  cfg.provider = provider;
  cfg.apiKeys[provider] = key;
  await saveConfig(cfg);
  h.setProvider(provider);
  return [asst(`Saved ${provider} key ${redact(key)} to ${configPath()}. Run /model to pick a model.`)];
}

async function cmdProvider(args: string[], h: SlashHelpers): Promise<ChatMessage[]> {
  const ids = listProviderIds();
  const id = (args[0] ?? "").toLowerCase();
  if (!id) return [asst(`Usage: /provider <id>. Known: ${ids.join(", ")}`)];
  if (!ids.includes(id)) return [asst(`Unknown provider "${id}". Known: ${ids.join(", ")}`)];
  const cfg = await loadConfig();
  cfg.provider = id;
  await saveConfig(cfg);
  h.setProvider(id);
  // One-step switch: if the saved model doesn't exist on the new provider,
  // auto-pick its first free model so the next chat just works.
  try {
    const choices = await fetchChoices(id);
    h.setModels(choices);
    h.stashChoices(choices);
    const cfg2 = await loadConfig();
    if (choices.length > 0 && !choices.some((m) => m.id === cfg2.model)) {
      const first = (choices.find((m) => m.isFree) ?? choices[0]) as ModelInfo;
      cfg2.model = first.id;
      await saveConfig(cfg2);
      h.setModel(first.id);
      return [asst(`Switched to ${id} + model ${first.id}${first.isFree ? " [Free]" : ""}. Ready — just chat.`)];
    }
    return [asst(`Switched to ${id} (model ${cfg2.model} kept). Use /model to change.`)];
  } catch (err) {
    return [asst(`Switched to ${id}, but couldn't fetch its models (${err instanceof Error ? err.message : String(err)}). Set its key with /key, then /model.`)];
  }
}

async function cmdRead(args: string[]): Promise<ChatMessage[]> {
  const rel = args[0] ?? "";
  if (!rel) return [asst("Usage: /read <relative-path>  — e.g. /read src/index.ts")];
  const cwd = process.cwd();
  const abs = path.resolve(cwd, rel);
  const check = path.relative(cwd, abs);
  if (check.startsWith("..") || path.isAbsolute(check)) {
    return [asst("That path is outside the workspace. Run `hasa` from that folder instead.")];
  }
  try {
    const content = await fs.readFile(abs, "utf8");
    const shown = content.length > 6000 ? content.slice(0, 6000) + `\n…(truncated — full file is ${content.length} chars)` : content;
    return [asst(`📄 ${rel}:\n${shown}`)];
  } catch {
    return [asst(`Can't read "${rel}" — check the path (relative to ${cwd}).`)];
  }
}

async function cmdConfig(h: SlashHelpers): Promise<ChatMessage[]> {
  void h;
  const cfg = await loadConfig();
  const lines = listProviderIds().map((id) => {
    const k = apiKeyFor(cfg, id);
    return `  ${id}: ${k ? redact(k) + " (set)" : "(not set)"}`;
  });
  return [asst(`Provider: ${cfg.provider}\nModel: ${cfg.model}\nKeys:\n${lines.join("\n")}`)];
}

/** Route a `/command`. Returns handled=false for normal chat input. */
export async function runSlash(input: string, h: SlashHelpers): Promise<SlashResult> {
  // Bare number right after a list = pick that entry (no slash needed).
  if (/^\d+$/.test(input.trim()) && h.takeChoices().length > 0) {
    return { handled: true, replies: await cmdModel([input.trim()], h) };
  }
  const parsed = parseSlash(input);
  if (!parsed) return { handled: false, replies: [] };
  switch (parsed.name) {
    case "help":
      return { handled: true, replies: [asst(SLASH_HELP)] };
    case "model":
      return { handled: true, replies: await cmdModel(parsed.args, h) };
    case "models":
      return { handled: true, replies: await cmdModelsCurrent(h) };
    case "key":
      return { handled: true, replies: await cmdKey(parsed.args, h) };
    case "provider":
      return { handled: true, replies: await cmdProvider(parsed.args, h) };
    case "read":
      return { handled: true, replies: await cmdRead(parsed.args) };
    case "config":
      return { handled: true, replies: await cmdConfig(h) };
    case "new":
      h.newSession();
      return { handled: true, replies: [asst("New session started.")] };
    default:
      return { handled: true, replies: [asst(`Unknown command "/${parsed.name}".\n${SLASH_HELP}`)] };
  }
}
