import { editFileTool, readFileTool, writeFileTool } from "./fileEdit.js";
import { runShellTool } from "./shell.js";
import { searchCodeTool } from "./search.js";
import { gitCommitTool, gitDiffTool } from "./git.js";
import type { Tool } from "./types.js";

export const ALL_TOOLS: Tool[] = [readFileTool, writeFileTool, editFileTool, runShellTool, searchCodeTool, gitDiffTool, gitCommitTool];

export function toolMap(): Map<string, Tool> {
  return new Map(ALL_TOOLS.map((t) => [t.name, t]));
}

export * from "./types.js";
