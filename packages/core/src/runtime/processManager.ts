import { spawn, type ChildProcess } from "node:child_process";
import { extractDevUrl } from "./errors.js";

export interface ProcessStatus {
  id: string;
  command: string;
  cwd: string;
  pid: number | undefined;
  running: boolean;
  exitCode: number | null;
  startedAt: number;
  uptimeMs: number;
  url: string | null;
}

interface ManagedProc {
  id: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  lines: string[];
  running: boolean;
  exitCode: number | null;
  startedAt: number;
  url: string | null;
}

const MAX_LINES = 2000;
const MAX_LINE_LEN = 2000;

function pushLine(proc: ManagedProc, chunk: string): void {
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.slice(0, MAX_LINE_LEN);
    proc.lines.push(line);
    if (proc.lines.length > MAX_LINES) proc.lines.splice(0, proc.lines.length - MAX_LINES);
    const found = extractDevUrl(line);
    if (found && !proc.url) proc.url = found;
  }
}

/** Long-running process table. One instance per session; shared via ToolContext. */
export class ProcessManager {
  private procs = new Map<string, ManagedProc>();

  /** Start (or reuse) a named process. Returns pid + whether it was already running. */
  async start(id: string, command: string, cwd: string): Promise<{ pid: number | undefined; reused: boolean; url: string | null }> {
    const existing = this.procs.get(id);
    if (existing && existing.running) return { pid: existing.child.pid, reused: true, url: existing.url };
    if (existing && !existing.running) this.procs.delete(id);

    const isWin = process.platform === "win32";
    const child = spawn(isWin ? "cmd.exe" : "/bin/sh", isWin ? ["/d", "/s", "/c", command] : ["-c", command], {
      cwd,
      windowsHide: true,
    });
    const proc: ManagedProc = {
      id,
      command,
      cwd,
      child,
      lines: [`$ ${command}`],
      running: true,
      exitCode: null,
      startedAt: Date.now(),
      url: null,
    };
    child.stdout?.on("data", (d: Buffer) => pushLine(proc, d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => pushLine(proc, d.toString("utf8")));
    child.on("error", (err: Error) => {
      pushLine(proc, `[process error] ${err.message}`);
      proc.running = false;
    });
    child.on("close", (code: number | null) => {
      proc.running = false;
      proc.exitCode = code;
      pushLine(proc, `[exit ${code ?? "?"}]`);
    });
    this.procs.set(id, proc);
    // Give the process a tick so early output / errors are captured on first logs() call.
    await new Promise((r) => setTimeout(r, 50));
    return { pid: child.pid, reused: false, url: proc.url };
  }

  logs(id: string, tailLines = 100): string {
    const proc = this.procs.get(id);
    if (!proc) throw new Error(`Unknown process "${id}". Known: ${[...this.procs.keys()].join(", ") || "(none)"}`);
    const n = Math.min(Math.max(tailLines, 1), MAX_LINES);
    return proc.lines.slice(-n).join("\n").slice(0, 50_000);
  }

  status(id?: string): ProcessStatus[] {
    const list = id ? [this.procs.get(id)].filter((p): p is ManagedProc => !!p) : [...this.procs.values()];
    if (id && list.length === 0) throw new Error(`Unknown process "${id}"`);
    return list.map((p) => ({
      id: p.id,
      command: p.command,
      cwd: p.cwd,
      pid: p.child.pid,
      running: p.running,
      exitCode: p.exitCode,
      startedAt: p.startedAt,
      uptimeMs: Date.now() - p.startedAt,
      url: p.url,
    }));
  }

  async stop(id: string): Promise<boolean> {
    const proc = this.procs.get(id);
    if (!proc) return false;
    if (!proc.running) return true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 3000);
      proc.child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        proc.child.kill();
      } catch {
        resolve();
      }
    });
    if (proc.running) {
      try {
        proc.child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }
    return true;
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.procs.keys()]) await this.stop(id);
  }
}

let globalManager: ProcessManager | null = null;

/** Shared fallback so CLI/RPC callers that don't pass ToolContext.processes still work. */
export function getGlobalProcessManager(): ProcessManager {
  if (!globalManager) globalManager = new ProcessManager();
  return globalManager;
}
