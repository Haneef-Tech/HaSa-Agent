import { apiKeyFor, getProvider, listProviderIds, loadConfig, redact } from "hasa-core";

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const to = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("timed out after 20s")), ms);
  });
  return Promise.race([p.finally(() => { if (t) clearTimeout(t); }), to]);
}

/** Test every saved key and report OK/FAIL per provider. No chat = (almost) no cost. */
export async function runDoctor(): Promise<void> {
  const cfg = await loadConfig();
  console.log("HASA doctor — testing each saved key…\n");
  for (const id of listProviderIds()) {
    const key = apiKeyFor(cfg, id);
    if (!key) {
      console.log(`- ${id}: no key saved — add with:  /key ${id} <key>   (or: hasa setup)`);
      continue;
    }
    const tag = redact(key);
    try {
      const p = getProvider(id, cfg.providers?.[id]?.baseUrl);
      const models = await timeout(p.listModels(key, cfg.providers?.[id]?.baseUrl), 20000);
      const free = models.filter((m) => m.isFree).length;
      console.log(`- ${id}: key ${tag} OK (${models.length} models, ${free} free) — pick one with /model`);
    } catch (err) {
      console.log(`- ${id}: key ${tag} FAIL (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  console.log("\nFix any key with:  /key <provider> <new-key>   (inside hasa)  or:  hasa setup");
}
