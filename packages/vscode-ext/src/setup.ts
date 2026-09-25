import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Mirrors hasa-core config paths so CLI and extension share one file. */
export function configDir(): string {
  return process.env["HASA_CONFIG_DIR"] ?? path.join(os.homedir(), ".hasa");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

interface StoredConfig {
  provider?: string;
  model?: string;
  apiKeys?: Record<string, string>;
  providers?: Record<string, { baseUrl?: string; apiKey?: string }>;
  permissions?: { defaultPolicy?: "ask" | "allow" | "deny"; alwaysAllow?: string[]; alwaysDeny?: string[] };
}

/** Provider ids — must match hasa-core registry. */
export const PROVIDER_IDS = ["nara", "zen", "gemini", "anthropic", "groq", "openai-compatible"];

export async function readStoredConfig(): Promise<StoredConfig> {
  try {
    return JSON.parse(await fs.readFile(configPath(), "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

/** Merge patch into ~/.hasa/config.json (owner-only file where supported). */
export async function writeStoredConfig(patch: StoredConfig): Promise<string> {
  const current = await readStoredConfig();
  const next: StoredConfig = {
    ...current,
    ...patch,
    apiKeys: { ...(current.apiKeys ?? {}), ...(patch.apiKeys ?? {}) },
    providers: { ...(current.providers ?? {}), ...(patch.providers ?? {}) },
  };
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return configPath();
}
