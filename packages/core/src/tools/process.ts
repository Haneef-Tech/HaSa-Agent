import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";
import { getGlobalProcessManager } from "../runtime/processManager.js";
import { openVisibleTerminal } from "../runtime/terminal.js";
import { detectProject, formatProjectInfo } from "../runtime/detect.js";
import { extractDevUrl, parseError } from "../runtime/errors.js";

function managerOf(ctx: ToolContext) {
  return ctx.processes ?? getGlobalProcessManager();
}

function intArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export const projectDetectTool: Tool = {
  name: "project_detect",
  description: "Detect project framework and install/dev/test commands. Call this first for 'run my project'.",
  parameters: { type: "object", properties: {}, required: [] },
  destructive: false,
  async execute(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const info = await detectProject(ctx.cwd);
    return { ok: true, output: formatProjectInfo(info) };
  },
};

export const processStartTool: Tool = {
  name: "process_start",
  description: "Start a LONG-RUNNING command (dev server, watcher) as a named background process. Use run_shell for one-shot commands instead.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Process name, e.g. 'dev'. Reuses the running process if the id exists." },
      command: { type: "string", description: "Command to run, e.g. 'npm run dev'" },
    },
    required: ["id", "command"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const id = strArg(args, "id");
    const command = strArg(args, "command");
    const decision = await ctx.gate.check(`process start: ${command}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    const mgr = managerOf(ctx);
    const r = await mgr.start(id, command, ctx.cwd);
    // Surface any immediate output so boot errors (bad import, missing dep) are visible right away.
    await new Promise((res) => setTimeout(res, 1500));
    const logs = mgr.logs(id, 60);
    const url = extractDevUrl(logs);
    const err = parseError(logs);
    const head = r.reused ? `Reusing running process "${id}" (pid ${r.pid ?? "?"})` : `Started "${id}" (pid ${r.pid ?? "?"})`;
    const extra = [
      url ? `URL: ${url}` : null,
      err ? `POSSIBLE ERROR [${err.kind}]: ${err.message}${err.fileHint ? ` (file hint: ${err.fileHint})` : ""}` : null,
    ].filter(Boolean).join("\n");
    return { ok: true, output: `${head}\n--- recent output ---\n${logs}${extra ? `\n--- analysis ---\n${extra}` : ""}` };
  },
};

export const processLogsTool: Tool = {
  name: "process_logs",
  description: "Read recent output (stdout+stderr) of a background process. Use this to observe dev servers and find errors.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Process name" },
      tailLines: { type: "number", description: "Last N lines (default 100)" },
    },
    required: ["id"],
  },
  destructive: false,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const id = strArg(args, "id");
    const tail = intArg(args, "tailLines", 100);
    const mgr = managerOf(ctx);
    try {
      const logs = mgr.logs(id, tail);
      const [s] = mgr.status(id);
      const url = extractDevUrl(logs) ?? s?.url ?? null;
      const err = parseError(logs);
      const summary = `status: ${s?.running ? "running" : `stopped (exit ${s?.exitCode ?? "?"})`}${url ? ` | URL: ${url}` : ""}${err ? ` | ERROR [${err.kind}]: ${err.message}` : ""}`;
      return { ok: true, output: `${summary}\n--- logs ---\n${logs}` };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const processStatusTool: Tool = {
  name: "process_status",
  description: "List background processes: running state, pid, uptime, detected URL.",
  parameters: { type: "object", properties: { id: { type: "string", description: "Optional single process name" } }, required: [] },
  destructive: false,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const id = typeof args["id"] === "string" && (args["id"] as string).length > 0 ? (args["id"] as string) : undefined;
    const mgr = managerOf(ctx);
    try {
      const list = mgr.status(id);
      if (list.length === 0) return { ok: true, output: "(no background processes)" };
      return {
        ok: true,
        output: list.map((s) => `${s.id}: ${s.running ? "running" : `stopped (exit ${s.exitCode ?? "?"})`} pid=${s.pid ?? "?"} uptime=${Math.round(s.uptimeMs / 1000)}s cmd="${s.command}"${s.url ? ` url=${s.url}` : ""}`).join("\n"),
      };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const processStopTool: Tool = {
  name: "process_stop",
  description: "Stop a background process by name.",
  parameters: { type: "object", properties: { id: { type: "string", description: "Process name" } }, required: ["id"] },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const id = strArg(args, "id");
    const decision = await ctx.gate.check(`process stop: ${id}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    const mgr = managerOf(ctx);
    const stopped = await mgr.stop(id);
    return stopped ? { ok: true, output: `Stopped "${id}"` } : { ok: false, output: `Unknown process "${id}"` };
  },
};

export const terminalOpenTool: Tool = {
  name: "terminal_open",
  description:
    "Open a VISIBLE OS terminal window running a command (e.g. 'python app.py'). Use when the user explicitly asks for output 'in a new terminal'. Output stays in that window — HASA cannot read it back, so also report what was launched.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Window title id, e.g. 'app'" },
      command: { type: "string", description: "Command to run, e.g. 'python app.py'" },
    },
    required: ["id", "command"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const id = strArg(args, "id");
    const command = strArg(args, "command");
    const decision = await ctx.gate.check(`terminal open: ${command}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    try {
      const msg = await openVisibleTerminal(id, command, ctx.cwd);
      return { ok: true, output: `${msg}\nNOTE: output is in the new window, not here. Use process_start instead if you need HASA to read logs.` };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  },
};
