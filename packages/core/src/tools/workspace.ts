import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";
import { openBrowser } from "../runtime/browser.js";

function resolveIn(cwd: string, p: string): string {
  const abs = path.resolve(cwd, p);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Path escapes workspace: ${p}`);
  return abs;
}

export const createFolderTool: Tool = {
  name: "create_folder",
  description:
    "Create a folder (and parents) inside the workspace. Use for plain requests like 'make a folder for my photos website'.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Relative folder path, e.g. 'my-website' or 'a/b'" } },
    required: ["path"],
  },
  destructive: true,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const rel = strArg(args, "path");
    const abs = resolveIn(ctx.cwd, rel);
    const decision = await ctx.gate.check(`create folder ${rel}`, true);
    if (decision !== "allow") return { ok: false, output: `Denied by permission policy (${decision})` };
    await fs.mkdir(abs, { recursive: true });
    return { ok: true, output: `Created folder ${rel}` };
  },
};

export const browserOpenTool: Tool = {
  name: "browser_open",
  description:
    "Open a URL in the user's default browser. Use after a dev server or website is running, or when the user says 'show me' / 'open the website'.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "Full http(s) URL, e.g. 'http://localhost:5173/'" } },
    required: ["url"],
  },
  destructive: false,
  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const url = strArg(args, "url");
    try {
      const msg = await openBrowser(url);
      return { ok: true, output: msg };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  },
};
