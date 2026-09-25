import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_CONFIG, validateConfig, type HasaConfig } from "./schema.js";

export function configDir(): string {
  return process.env["HASA_CONFIG_DIR"] ?? path.join(os.homedir(), ".hasa");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

/** Load config: env vars override file. Never logs secret values. */
export async function loadConfig(): Promise<HasaConfig> {
  let fileCfg: Partial<HasaConfig> = {};
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const v = validateConfig({ ...DEFAULT_CONFIG, ...(parsed as Record<string, unknown>) });
    if (v.ok) fileCfg = v.config;
  } catch {
    // missing file is fine — fall back to env/defaults
  }

  const cfg: HasaConfig = { ...DEFAULT_CONFIG, ...fileCfg };
  cfg.apiKeys = { ...(fileCfg.apiKeys ?? {}) };

  // Env overrides (highest precedence). Key names are explicit so we never
  // accidentally pick up unrelated env vars.
  const envMap: Record<string, string | undefined> = {
    nara: process.env["NARA_API_KEY"],
    zen: process.env["ZEN_API_KEY"],
    gemini: process.env["GEMINI_API_KEY"],
    anthropic: process.env["ANTHROPIC_API_KEY"],
    groq: process.env["GROQ_API_KEY"],
    "openai-compatible": process.env["HASA_ROUTER_API_KEY"],
  };
  for (const [k, v] of Object.entries(envMap)) {
    if (v && v.length > 0) cfg.apiKeys[k] = v;
  }
  if (process.env["HASA_PROVIDER"]) cfg.provider = process.env["HASA_PROVIDER"];
  if (process.env["HASA_MODEL"]) cfg.model = process.env["HASA_MODEL"];
  const customBase = process.env["HASA_ROUTER_BASE_URL"];
  if (customBase) {
    cfg.providers = { ...(cfg.providers ?? {}), "openai-compatible": { ...(cfg.providers?.["openai-compatible"] ?? {}), baseUrl: customBase } };
  }
  return cfg;
}

/** Persist config with mode 600 (owner-only) where supported. */
export async function saveConfig(cfg: HasaConfig): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

/** Return key for a provider without ever printing it. */
export function apiKeyFor(cfg: HasaConfig, provider: string): string {
  return cfg.apiKeys[provider] ?? cfg.providers?.[provider]?.apiKey ?? "";
}

/** Redact secrets for logging. */
export function redact(s: string): string {
  if (s.length <= 8) return "***";
  return s.slice(0, 3) + "***" + s.slice(-2);
}
