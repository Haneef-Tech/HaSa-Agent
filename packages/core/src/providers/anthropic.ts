import type { AssistantResult, ChatMessage } from "../types.js";
import type { ChatOptions, ModelInfo, ModelProvider } from "./types.js";
import { CURATED_FREE_MODELS } from "./freeModels.js";
import { assertAllowedHost, fetchWithRetry } from "./openaiCompatible.js";

/**
 * Anthropic Messages API adapter (exposed through the shared ModelProvider interface).
 * Tools are translated to Anthropic `tools`; tool_use blocks are parsed back to ToolCalls.
 */
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly allowedHosts = ["api.anthropic.com"];

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<AssistantResult> {
    assertAllowedHost("https://api.anthropic.com", this.allowedHosts);
    const system = [opts.systemPrompt, ...messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean).join("\n");
    const apiMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.role === "assistant") {
          const blocks: Array<Record<string, unknown>> = [];
          if (m.content) blocks.push({ type: "text", text: m.content });
          for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
          return { role: "assistant", content: blocks };
        }
        if (m.role === "tool") {
          return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }] };
        }
        return { role: "user", content: m.content };
      });
    const res = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          system: system || undefined,
          messages: apiMessages.length > 0 ? apiMessages : [{ role: "user", content: "." }],
          max_tokens: opts.maxTokens ?? 4096,
          tools: (opts.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        }),
        signal: opts.signal,
      },
      "anthropic chat",
    );
    if (!res.ok) throw new Error(`anthropic chat failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string; name?: string; id?: string; input?: Record<string, unknown> }>;
      model?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    let text = "";
    const toolCalls: AssistantResult["toolCalls"] = [];
    for (const b of json.content ?? []) {
      if (b.type === "text" && b.text) text += b.text;
      if (b.type === "tool_use" && b.name) toolCalls.push({ id: b.id ?? b.name, name: b.name, args: b.input ?? {} });
    }
    return { text, toolCalls, model: json.model ?? opts.model, usage: json.usage ? { promptTokens: json.usage.input_tokens, completionTokens: json.usage.output_tokens } : undefined };
  }

  async *chatStream(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string> {
    // Simple fallback: non-streaming call, then yield in one chunk.
    const r = await this.chat(messages, opts);
    if (r.text) yield r.text;
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    assertAllowedHost("https://api.anthropic.com", this.allowedHosts);
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
      return (json.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id, contextLength: 200000, isFree: false, provider: this.id }));
    } catch {
      return CURATED_FREE_MODELS.filter((m) => m.provider === this.id).map((m) => ({ ...m, isFree: true }));
    }
  }
}
