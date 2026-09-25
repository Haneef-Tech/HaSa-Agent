// JSON-RPC over stdio — lets the VS Code extension reuse core without re-implementing logic.
import { runAgent } from "./agent/loop.js";
import { loadConfig, apiKeyFor } from "./config/loader.js";
import { getProvider } from "./providers/registry.js";
import { PermissionGate } from "./permissions/gate.js";
import type { ChatMessage } from "./types.js";

interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: "chat" | "listModels";
  params: { messages?: ChatMessage[]; input?: string; cwd?: string; history?: ChatMessage[] };
}

export async function startRpcServer(): Promise<void> {
  const cfg = await loadConfig();
  const provider = getProvider(cfg.provider, cfg.providers?.[cfg.provider]?.baseUrl);
  const apiKey = apiKeyFor(cfg, cfg.provider);
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) void handleLine(line, provider, apiKey, cfg.model, cfg.providers?.[cfg.provider]?.baseUrl);
    }
  });
}

async function handleLine(line: string, provider: ReturnType<typeof getProvider>, apiKey: string, model: string, baseUrl: string | undefined): Promise<void> {
  let req: RpcRequest;
  try {
    req = JSON.parse(line) as RpcRequest;
  } catch {
    return;
  }
  const respond = (result: unknown): void => {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n");
  };
  const fail = (message: string): void => {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { message } }) + "\n");
  };
  try {
    if (req.method === "listModels") {
      respond(await provider.listModels(apiKey, baseUrl));
    } else if (req.method === "chat") {
      const input = req.params.input ?? "";
      const history = req.params.history ?? [];
      const cwd = req.params.cwd ?? process.cwd();
      const gate = new PermissionGate({ defaultPolicy: "ask", alwaysAllow: [], alwaysDeny: [] });
      const text = await runAgent(input, history, {
        provider,
        model,
        apiKey,
        baseUrl,
        cwd,
        toolCtx: { cwd, gate },
      });
      respond({ text });
    } else {
      fail(`unknown method ${String((req as { method?: string }).method)}`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
