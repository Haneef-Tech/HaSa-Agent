import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { strArg } from "./types.js";

async function walk(dir: string, out: string[], limit: number): Promise<void> {
  if (out.length >= limit) return;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, limit);
    else out.push(full);
  }
}

export const searchCodeTool: Tool = {
  name: "search_code",
  description: "Search workspace for a regex (ripgrep if available, else Node fallback).",
  parameters: {
    type: "object",
    properties: { pattern: { type: "string", description: "Regex pattern" }, include: { type: "string", description: "Glob filter, e.g. *.ts" } },
    required: ["pattern"],
  },
  destructive: false,
  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = strArg(args, "pattern");
    const include = typeof args["include"] === "string" ? (args["include"] as string) : undefined;
    const rg = await new Promise<string | null>((resolve) => {
      execFile("rg", ["--no-heading", "--line-number", ...(include ? ["-g", include] : []), pattern, ctx.cwd], { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err && !stdout) return resolve(null);
        resolve(String(stdout ?? ""));
      });
    });
    if (rg !== null) return { ok: true, output: rg.slice(0, 30_000) || "(no matches)" };
    // Fallback: naive recursive scan of small text files.
    const files: string[] = [];
    await walk(ctx.cwd, files, 500);
    const re = new RegExp(pattern);
    const hits: string[] = [];
    for (const f of files) {
      try {
        const text = await fs.readFile(f, "utf8");
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (re.test(line)) hits.push(`${path.relative(ctx.cwd, f)}:${i + 1}:${line.slice(0, 300)}`);
        });
        if (hits.length > 200) break;
      } catch {
        // skip binary/unreadable
      }
    }
    return { ok: true, output: hits.slice(0, 200).join("\n") || "(no matches)" };
  },
};
