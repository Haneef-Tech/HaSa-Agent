import type { ChatMessage, ToolCall } from "../types.js";
import type { ModelProvider, ToolSpec } from "../providers/types.js";
import { ALL_TOOLS, toolMap, type ToolContext } from "../tools/index.js";
import { buildSystemPrompt } from "./prompts.js";
import { parseFencedToolCalls } from "./toolParser.js";

export interface AgentEvents {
  onText?: (delta: string, full: string) => void;
  onToolStart?: (call: ToolCall) => void;
  onToolEnd?: (call: ToolCall, output: string, ok: boolean) => void;
}

export interface RunOptions {
  provider: ModelProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  cwd: string;
  toolCtx: ToolContext;
  systemExtra?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  events?: AgentEvents;
}

function toToolSpecs(): ToolSpec[] {
  return ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

/** ReAct loop: plan → tool → observe → respond. Returns final assistant text. */
export async function runAgent(userInput: string, history: ChatMessage[], opts: RunOptions): Promise<string> {
  const map = toolMap();
  const specs = toToolSpecs();
  const systemPrompt = buildSystemPrompt(opts.systemExtra);
  const messages: ChatMessage[] = [...history, { role: "user", content: userInput }];
  const maxSteps = opts.maxSteps ?? 12;
  let lastText = "";

  for (let step = 0; step < maxSteps; step++) {
    const res = await opts.provider.chat(messages, {
      model: opts.model,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      systemPrompt,
      tools: specs,
      signal: opts.signal,
    });
    const native = res.toolCalls ?? [];
    const fenced = parseFencedToolCalls(res.text);
    const calls = [...native, ...fenced].filter((c) => map.has(c.name));
    lastText = res.text;

    if (calls.length === 0) {
      messages.push({ role: "assistant", content: res.text });
      opts.events?.onText?.(res.text, res.text);
      return res.text;
    }

    messages.push({ role: "assistant", content: res.text, toolCalls: calls });
    for (const call of calls) {
      opts.events?.onToolStart?.(call);
      const tool = map.get(call.name);
      if (!tool) continue;
      try {
        const out = await tool.execute(call.args, opts.toolCtx);
        const obs = `OBSERVATION [${call.name} ${out.ok ? "ok" : "failed"}]:\n${out.output}`;
        messages.push({ role: "tool", content: obs, name: call.name, toolCallId: call.id });
        opts.events?.onToolEnd?.(call, out.output, out.ok);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        messages.push({ role: "tool", content: `OBSERVATION [${call.name} error]:\n${msg}`, name: call.name, toolCallId: call.id });
        opts.events?.onToolEnd?.(call, msg, false);
      }
    }
  }
  return lastText || "(stopped after max steps — refine your request and try again)";
}

/** Streaming helper for the TUI status line (text-only preview). */
export async function streamPreview(provider: ModelProvider, messages: ChatMessage[], opts: { model: string; apiKey: string; baseUrl?: string; systemExtra?: string }, onDelta: (d: string) => void): Promise<void> {
  for await (const d of provider.chatStream(messages, { model: opts.model, apiKey: opts.apiKey, baseUrl: opts.baseUrl, systemPrompt: buildSystemPrompt(opts.systemExtra) })) {
    onDelta(d);
  }
}
