import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  apiKeyFor,
  configPath,
  getProvider,
  listProviderIds,
  loadConfig,
  onlyChatModels,
  redact,
  saveConfig,
  writeCache,
  type ModelInfo,
} from "hasa-core";

export function printHelp(): void {
  console.log(`hasa — local-first AI coding agent (BYOK: your key, your models)

Usage:
  hasa                  start the TUI chat
  hasa setup            interactive setup: provider → API key → free model
  hasa models [--all]   list available models ([Free] = $0, default hides paid)
  hasa config           show current provider/model/key status (keys redacted)
  hasa doctor           test every saved key, report OK/FAIL per provider
  hasa --rpc            JSON-RPC server over stdio (used by the VS Code extension)
  hasa --help           this help

Your key is stored only in ${configPath()} (owner-only file) — never sent
anywhere except the provider's own API. Env vars (NARA_API_KEY,
ZEN_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY,
GROQ_API_KEY, HASA_ROUTER_API_KEY) override the file.
`);
}

async function ask(rl: ReturnType<typeof createInterface>, q: string, def?: string): Promise<string> {
  const suffix = def ? ` [${def}]` : "";
  const ans = (await rl.question(`${q}${suffix}: `)).trim();
  return ans || def || "";
}

async function pickNumber(rl: ReturnType<typeof createInterface>, items: string[], defIndex: number): Promise<number> {
  items.forEach((label, i) => console.log(`  ${i + 1}. ${label}`));
  for (;;) {
    const ans = await ask(rl, "Pick a number", String(defIndex + 1));
    const n = Number(ans);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
    console.log(`Enter 1–${items.length}.`);
  }
}

/** Interactive first-run wizard. Safe to re-run anytime. */
export async function runSetup(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    console.log("HASA setup — your key stays on this machine.\n");
    const cfg = await loadConfig();
    const providers = listProviderIds();
    console.log("Provider:");
    const pi = await pickNumber(rl, providers, Math.max(providers.indexOf(cfg.provider), 0));
    const provider = providers[pi] as string;
    cfg.provider = provider;

    if (provider === "openai-compatible") {
      const current = cfg.providers?.["openai-compatible"]?.baseUrl ?? "";
      const baseUrl = await ask(rl, "Router base URL (https://<host>/v1)", current || undefined);
      if (!baseUrl) throw new Error("base URL is required for openai-compatible");
      new URL(baseUrl); // validates format
      cfg.providers = { ...(cfg.providers ?? {}), "openai-compatible": { ...(cfg.providers?.["openai-compatible"] ?? {}), baseUrl } };
    }

    const existing = apiKeyFor(cfg, provider);
    const keyPrompt = existing ? `API key for ${provider} (press Enter to keep ${redact(existing)})` : `API key for ${provider}`;
    const key = await ask(rl, keyPrompt);
    if (key) cfg.apiKeys[provider] = key;
    if (!apiKeyFor(cfg, provider)) throw new Error("No API key provided — run `hasa setup` again when you have one.");

    // Test the key + discover free models.
    const p = getProvider(provider, cfg.providers?.[provider]?.baseUrl);
    console.log("\nChecking key and fetching models…");
    const all = await p.listModels(apiKeyFor(cfg, provider), cfg.providers?.[provider]?.baseUrl);
    const free = all.filter((m) => m.isFree);
    const choices: ModelInfo[] = onlyChatModels(free.length > 0 ? free : all).slice(0, 20);
    let chosenFree = false;
    if (choices.length > 0) {
      await writeCache(provider, choices);
      console.log(free.length > 0 ? `\nFound ${free.length} FREE model(s):` : "\nNo free models reported — showing all:");
      const currentIdx = Math.max(choices.findIndex((m) => m.id === cfg.model), 0);
      const mi = await pickNumber(
        rl,
        choices.map((m) => `${m.id}${m.isFree ? "  [Free]" : ""}  (${Math.round(m.contextLength / 1000)}k ctx)`),
        currentIdx,
      );
      const chosen = choices[mi] as ModelInfo;
      cfg.model = chosen.id;
      chosenFree = chosen.isFree;
    } else {
      // Router exposes no /models list (or key lacks permission) — enter the id manually.
      console.log("\nThis router returned no model list — type the model id manually.");
      const manual = await ask(rl, "Model id", cfg.model || undefined);
      if (!manual) throw new Error("No model id provided — run `hasa setup` again.");
      cfg.model = manual;
    }

    await saveConfig(cfg);
    console.log(`\nSaved to ${configPath()}`);
    console.log(`Provider: ${cfg.provider}\nModel:    ${cfg.model}${chosenFree ? "  [Free]" : ""}`);
    console.log("\nDone! Start chatting with:  hasa");
  } finally {
    rl.close();
  }
}

/** List models for the configured provider. */
export async function runModels(showAll: boolean): Promise<void> {
  const cfg = await loadConfig();
  const key = apiKeyFor(cfg, cfg.provider);
  if (!key) {
    console.log("No API key set. Run `hasa setup` first.");
    process.exitCode = 1;
    return;
  }
  const p = getProvider(cfg.provider, cfg.providers?.[cfg.provider]?.baseUrl);
  const all = await p.listModels(key, cfg.providers?.[cfg.provider]?.baseUrl);
  const free = all.filter((m) => m.isFree);
  const list = (showAll ? all : free.length > 0 ? free : all).slice(0, 40);
  console.log(`Provider: ${cfg.provider}   (current model: ${cfg.model})\n`);
  for (const m of list) {
    const cur = m.id === cfg.model ? "  <-- current" : "";
    console.log(`${m.isFree ? "[Free] " : "       "}${m.id}  (${Math.round(m.contextLength / 1000)}k)${cur}`);
  }
  if (!showAll && all.length > free.length) console.log(`\n+ ${all.length - free.length} paid models hidden — use \`hasa models --all\` to see them.`);
}

/** Show config summary with keys redacted. */
export async function runConfigShow(): Promise<void> {
  const cfg = await loadConfig();
  console.log(`Config file: ${configPath()}`);
  console.log(`Provider:    ${cfg.provider}`);
  console.log(`Model:       ${cfg.model}`);
  console.log("Keys:");
  for (const id of listProviderIds()) {
    const k = apiKeyFor(cfg, id);
    console.log(`  ${id}: ${k ? redact(k) + " (set)" : "(not set)"}`);
  }
}
