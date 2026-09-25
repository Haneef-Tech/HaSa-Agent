import { execFile } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";

const BLOCKED = [/rm\s+-rf\s+\/(?!\w)/i, /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/, /format\s+[a-z]:/i, /mkfs/i];

function blocked(cmd: string): boolean {
  return BLOCKED.some((re) => re.test(cmd));
}

function run(cmd: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = execFile(isWin ? "cmd.exe" : "/bin/sh", isWin ? ["/d", "/s", "/c", cmd] : ["-c", cmd], { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? (err?.message ?? "")), code: (err as { code?: number } | null)?.code ?? 0 });
    });
    void child;
  });
}

export const runShellTool: Tool = {
  name: "run_shell",
  description: "Run a shell command in the workspace cwd. Sandboxed + permission-gated. Read-only commands preferred.",
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "Shell command" }, timeoutMs: { type: "number", description: "Timeout ms (default 30000)" } },
    required: ["command"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = strArg(args, "command");
    if (blocked(command)) return { ok: false, output: "Blocked by safety filter" };
    const timeoutMs = typeof args["timeoutMs"] === "number" ? (args["timeoutMs"] as number) : 30000;
    const decision = await ctx.gate.check(`shell: ${command}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    const r = await run(command, ctx.cwd, Math.min(Math.max(timeoutMs, 1000), 120000));
    const out = (r.stdout + (r.stderr ? `\n[stderr]\n${r.stderr}` : "")).slice(0, 50_000);
    return { ok: r.code === 0, output: `[exit ${r.code}]\n${out}` };
  },
};
