import type { JsonSchema } from "../types.js";
import type { PermissionGate } from "../permissions/gate.js";

export interface ToolContext {
  cwd: string;
  gate: PermissionGate;
  /** Ask UI to confirm a diff before writing. Returns true if approved. */
  confirmDiff?: (file: string, diff: string) => Promise<boolean>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly destructive: boolean;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export function strArg(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    if (!required) return "";
    throw new Error(`Missing required string argument "${key}"`);
  }
  return v;
}
