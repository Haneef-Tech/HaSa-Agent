import { editFileTool, readFileTool, writeFileTool } from "./fileEdit.js";
import { runShellTool } from "./shell.js";
import { searchCodeTool } from "./search.js";
import { gitCommitTool, gitDiffTool } from "./git.js";
import { processLogsTool, processStartTool, processStatusTool, processStopTool, projectDetectTool, terminalOpenTool } from "./process.js";
import { browserOpenTool, createFolderTool } from "./workspace.js";
import type { Tool } from "./types.js";

export const ALL_TOOLS: Tool[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  createFolderTool,
  runShellTool,
  searchCodeTool,
  gitDiffTool,
  gitCommitTool,
  projectDetectTool,
  processStartTool,
  processLogsTool,
  processStatusTool,
  processStopTool,
  terminalOpenTool,
  browserOpenTool,
];

export function toolMap(): Map<string, Tool> {
  return new Map(ALL_TOOLS.map((t) => [t.name, t]));
}

export * from "./types.js";
