import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";

function resolveIn(cwd: string, p: string): string {
  const abs = path.resolve(cwd, p);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Path escapes workspace: ${p}`);
  return abs;
}

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read a UTF-8 text file from the workspace. Paths are relative to cwd.",
  parameters: { type: "object", properties: { path: { type: "string", description: "Relative file path" } }, required: ["path"] },
  destructive: false,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const abs = resolveIn(ctx.cwd, strArg(args, "path"));
    const content = await fs.readFile(abs, "utf8");
    return { ok: true, output: content.slice(0, 200_000) };
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Create or overwrite a file. ALWAYS shows a diff preview and requires permission first.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Relative file path" }, content: { type: "string", description: "Full new content" } },
    required: ["path", "content"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const rel = strArg(args, "path");
    const content = strArg(args, "content");
    const abs = resolveIn(ctx.cwd, rel);
    const decision = await ctx.gate.check(`write ${rel}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    let old = "";
    try {
      old = await fs.readFile(abs, "utf8");
    } catch {
      old = "";
    }
    const diff = `--- a/${rel}\n+++ b/${rel}\n@@\n- ${(old.slice(0, 500) || "(new file)").replace(/\n/g, "\n- ")}\n+ ${content.slice(0, 500).replace(/\n/g, "\n+ ")}`;
    if (ctx.confirmDiff && !(await ctx.confirmDiff(rel, diff))) return { ok: false, output: "User rejected the diff" };
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return { ok: true, output: `Wrote ${rel} (${content.length} chars)` };
  },
};

export const editFileTool: Tool = {
  name: "edit_file",
  description: "Replace the FIRST occurrence of oldString with newString in a file. Shows diff + requires permission.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path" },
      oldString: { type: "string", description: "Exact text to replace" },
      newString: { type: "string", description: "Replacement text" },
    },
    required: ["path", "oldString", "newString"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const rel = strArg(args, "path");
    const oldString = strArg(args, "oldString");
    const newString = strArg(args, "newString");
    const abs = resolveIn(ctx.cwd, rel);
    const decision = await ctx.gate.check(`edit ${rel}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    const current = await fs.readFile(abs, "utf8");
    const idx = current.indexOf(oldString);
    if (idx === -1) return { ok: false, output: "oldString not found" };
    const next = current.slice(0, idx) + newString + current.slice(idx + oldString.length);
    if (ctx.confirmDiff && !(await ctx.confirmDiff(rel, `--- a/${rel}\n+++ b/${rel}\n@@ -1 +1 @@\n- ${oldString.slice(0, 300)}\n+ ${newString.slice(0, 300)}`))) {
      return { ok: false, output: "User rejected the diff" };
    }
    await fs.writeFile(abs, next, "utf8");
    return { ok: true, output: `Edited ${rel}` };
  },
};
