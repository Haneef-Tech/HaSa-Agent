import type { ToolCall } from "../types.js";

let counter = 0;

/** Parse ```tool:name {json}``` fenced blocks (fallback when provider has no native function-calling). */
export function parseFencedToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /```tool:([a-z_]+)\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = (m[1] ?? "").trim();
    const raw = (m[2] ?? "").trim();
    if (!name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(raw || "{}") as Record<string, unknown>;
    } catch {
      args = { _raw: raw };
    }
    counter += 1;
    calls.push({ id: `fenced_${counter}`, name, args });
  }
  return calls;
}

/** Strip tool blocks from display text so the chat pane stays readable. */
export function stripToolBlocks(text: string): string {
  return text.replace(/```tool:[a-z_]+\s*\n[\s\S]*?```/g, "").trim();
}
