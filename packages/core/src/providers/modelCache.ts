import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";

/** 24h file cache for the filtered free-model list. */
export interface FreeModelCache {
  savedAt: number;
  models: Array<{ id: string; name: string; contextLength: number; isFree: boolean; provider: string }>;
}

export function cachePath(provider: string): string {
  const dir = process.env["HASA_CONFIG_DIR"] ?? path.join(os.homedir(), ".hasa");
  // v2: old caches predate chat-model filtering — versioning retires them.
  return path.join(dir, `models-${provider}-v2.json`);
}

export async function readCache(provider: string, maxAgeMs = 24 * 3600 * 1000): Promise<FreeModelCache | null> {
  try {
    const raw = await fs.readFile(cachePath(provider), "utf8");
    const c = JSON.parse(raw) as FreeModelCache;
    if (Date.now() - c.savedAt > maxAgeMs) return null;
    return c;
  } catch {
    return null;
  }
}

export async function writeCache(provider: string, models: FreeModelCache["models"]): Promise<void> {
  const p = cachePath(provider);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ savedAt: Date.now(), models } satisfies FreeModelCache, null, 2));
}
