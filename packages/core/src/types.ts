/** Shared core types. No `any` allowed in core. */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  /** Native function calls made by this assistant message — replayed to the
   *  provider so multi-step tool use stays valid (Gemini rejects tool history
   *  without it). */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  /** Unique id for this call (client-generated if provider omits it). */
  id: string;
  name: string;
  /** Parsed JSON arguments. */
  args: Record<string, unknown>;
  /** Original provider payload (e.g. Gemini thoughtSignature) — replayed
   *  verbatim when present so strict endpoints accept the history. */
  raw?: unknown;
}

export interface AssistantResult {
  text: string;
  toolCalls: ToolCall[];
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; default?: unknown }>;
  required?: string[];
  additionalProperties?: boolean;
}
