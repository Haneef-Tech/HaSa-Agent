import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

/** Client for the local `hasa --rpc` subprocess (stdio JSON-RPC). The extension never implements agent logic. */
export class CoreClient {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buf = "";

  constructor(private cliEntry: string) {}

  start(): void {
    if (this.proc) return;
    const isJs = this.cliEntry.endsWith(".js");
    this.proc = spawn(isJs ? process.execPath : this.cliEntry, isJs ? [this.cliEntry, "--rpc"] : ["--rpc"], { stdio: ["pipe", "pipe", "inherit"] });
    this.proc.stdout?.setEncoding("utf8");
    this.proc.stdout?.on("data", (chunk: string) => this.onData(chunk));
    this.proc.on("exit", () => {
      this.proc = null;
      for (const [, p] of this.pending) p.reject(new Error("core subprocess exited"));
      this.pending.clear();
    });
  }

  stop(): void {
    this.proc?.kill();
    this.proc = null;
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id: number | string; result?: unknown; error?: { message: string } };
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } catch {
        // ignore malformed line
      }
    }
  }

  private call(method: "chat" | "listModels", params: Record<string, unknown>): Promise<unknown> {
    this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("core request timed out (120s)"));
        }
      }, 120000);
    });
  }

  async chat(input: string, cwd: string, history: Array<{ role: string; content: string }>): Promise<string> {
    const r = (await this.call("chat", { input, cwd, history })) as { text: string };
    return r.text;
  }

  async listModels(): Promise<Array<{ id: string; name: string; isFree: boolean; provider: string }>> {
    return (await this.call("listModels", {})) as Array<{ id: string; name: string; isFree: boolean; provider: string }>;
  }
}

export function defaultCliEntry(extensionPath: string): string {
  // dist/extension.js -> ../../cli/dist/index.js
  return path.join(extensionPath, "..", "cli", "dist", "index.js");
}
