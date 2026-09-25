import { execFile } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";

export const gitDiffTool: Tool = {
  name: "git_diff",
  description: "Show git diff (staged=false by default). Read-only.",
  parameters: { type: "object", properties: { staged: { type: "string", description: "set 'true' for --staged" } } },
  destructive: false,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const staged = args["staged"] === "true" || args["staged"] === true;
    const out = await new Promise<string>((resolve) => {
      execFile("git", staged ? ["diff", "--staged"] : ["diff"], { cwd: ctx.cwd, timeout: 15000 }, (err, stdout, stderr) => {
        resolve(String(stdout ?? stderr ?? err?.message ?? ""));
      });
    });
    return { ok: true, output: out.slice(0, 40_000) || "(clean)" };
  },
};

export const gitCommitTool: Tool = {
  name: "git_commit",
  description: "Commit staged changes with a message. Permission-gated.",
  parameters: { type: "object", properties: { message: { type: "string", description: "Conventional-commit message" } }, required: ["message"] },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const message = strArg(args, "message");
    const decision = await ctx.gate.check(`git commit: ${message}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied (${decision})` };
    const out = await new Promise<string>((resolve) => {
      execFile("git", ["commit", "-m", message], { cwd: ctx.cwd, timeout: 30000 }, (err, stdout, stderr) => {
        resolve(String(stdout ?? stderr ?? err?.message ?? ""));
      });
    });
    return { ok: true, output: out.slice(0, 10_000) };
  },
};
