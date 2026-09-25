import type { AssistantResult, ChatMessage, ToolCall } from "../types.js";
import type { ChatOptions, ModelInfo, ModelProvider, ToolSpec } from "./types.js";
import { CURATED_FREE_MODELS, isFreePricing } from "./freeModels.js";

/** Guard: refuse requests to non-pinned hosts (prevents key exfiltration). */
export function assertAllowedHost(url: string, allowed: string[]): void {
  const host = new URL(url).hostname.toLowerCase();
  const ok = allowed.some((a) => host === a.toLowerCase() || host.endsWith("." + a.toLowerCase()));
  if (!ok) throw new Error(`Blocked request to untrusted host "${host}". Allowed: ${allowed.join(", ")}`);
}

/**
 * Free tiers throttle aggressively — retry 429/5xx with exponential backoff
 * (honoring Retry-After). Surfaces a friendly error after 3 attempts.
 */
export async function fetchWithRetry(url: string, init: RequestInit, label: string, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) {
      const retryAfterMs = Number(last?.headers.get("retry-after") ?? "0") * 1000;
      const backoff = retryAfterMs > 0 ? retryAfterMs : 1000 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, Math.min(backoff, 30000)));
    }
    last = await fetch(url, init);
    if (last.status !== 429 && last.status < 500) return last;
  }
  const body = (await (last as Response).text()).slice(0, 300);
  throw new Error(
    `${label} failed with ${(last as Response).status} after ${tries} tries (free-tier rate limit). ` +
      `Wait a minute, then retry — or switch to a less-busy free model with /model. Details: ${body}`,
  );
}

interface OpenAIChoice {
  message: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
  delta?: { content?: string };
}

function toOpenAITools(tools: ToolSpec[] | undefined): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

function parseToolCalls(choice: OpenAIChoice["message"]): ToolCall[] {
  const calls = choice.tool_calls ?? [];
  return calls.map((c, i) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = { _raw: c.function.arguments };
    }
    // Keep the provider's original payload (thought signatures etc.) so
    // replaying history passes strict endpoints like Gemini.
    return { id: c.id || `call_${i}`, name: c.function.name, args, raw: c as unknown as Record<string, unknown> };
  });
}

/**
 * Generic OpenAI-compatible chat-completions provider.
 * Subclasses only set id / defaultBaseUrl / allowedHosts / headers.
 */
export abstract class OpenAICompatibleProvider implements ModelProvider {
  abstract readonly id: string;
  abstract readonly allowedHosts: string[];
  protected abstract defaultBaseUrl(): string;

  protected headers(apiKey: string, extra?: Record<string, string>): Record<string, string> {
    return { "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...(extra ?? {}) };
  }

  protected resolveBase(baseUrl?: string): string {
    const base = (baseUrl ?? this.defaultBaseUrl()).replace(/\/+$/, "");
    assertAllowedHost(base, this.allowedHosts);
    return base;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<AssistantResult> {
    const base = this.resolveBase(opts.baseUrl);
    const full: ChatMessage[] = opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }, ...messages] : messages;
    const body = {
      model: opts.model,
      messages: full.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        // Replay native calls: without tool_calls on the assistant message,
        // Gemini-style endpoints reject the following tool message (400).
        // Prefer the provider's original payload (thought signatures…),
        // rebuilding only when we synthesized the call (fenced blocks).
        ...(m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) =>
                c.raw && typeof c.raw === "object"
                  ? c.raw
                  : { id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } },
              ),
            }
          : {}),
      })),
      tools: toOpenAITools(opts.tools),
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      stream: false,
    };
    const url = `${base}/chat/completions`;
    // Some models reject parts of the request — adapt and retry (max 3 sends):
    //  - no function calling → resend without `tools` (fenced ```tool:``` fallback)
    //  - max_tokens too high → resend smaller (512, then 256)
    const send = (useTools: boolean, tokens: number): Promise<Response> =>
      fetchWithRetry(
        url,
        {
          method: "POST",
          headers: this.headers(opts.apiKey, opts.extraHeaders),
          body: JSON.stringify({ ...body, max_tokens: tokens, ...(useTools ? {} : { tools: undefined }) }),
          signal: opts.signal,
        },
        `${this.id} chat`,
      );
    let withTools = true;
    let maxTokens = opts.maxTokens ?? 4096;
    let res: Response = await send(true, maxTokens);
    for (let attempt = 0; attempt < 2 && res.status === 400; attempt++) {
      const peek = await res.text();
      if (withTools && /tool/i.test(peek)) {
        withTools = false;
      } else if (/max_tokens/i.test(peek) && maxTokens > 256) {
        maxTokens = maxTokens > 512 ? 512 : 256;
      } else {
        throw new Error(`${this.id} chat failed: 400 ${peek}`);
      }
      res = await send(withTools, maxTokens);
    }
    if (res.status === 403) {
      const t = await res.text();
      if (/free/i.test(t)) {
        throw new Error(
          `${this.id}: this free-tier model is restricted by the provider (${t.slice(0, 200)}). ` +
            `Use a paid model on this router, or switch provider with /provider.`,
        );
      }
      throw new Error(`${this.id} chat failed: 403 ${t}`);
    }
    if (!res.ok) throw new Error(`${this.id} chat failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { choices?: OpenAIChoice[]; usage?: { prompt_tokens: number; completion_tokens: number }; model?: string };
    const choice = json.choices?.[0]?.message;
    if (!choice) throw new Error(`${this.id} returned no choices`);
    return {
      text: choice.content ?? "",
      toolCalls: parseToolCalls(choice),
      model: (json.model as string) ?? opts.model,
      usage: json.usage ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens } : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string> {
    const base = this.resolveBase(opts.baseUrl);
    const body = {
      model: opts.model,
      messages: (opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }, ...messages] : messages),
      tools: toOpenAITools(opts.tools),
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      stream: true,
    };
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: this.headers(opts.apiKey, opts.extraHeaders),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(`${this.id} stream failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const evt = JSON.parse(data) as { choices?: OpenAIChoice[] };
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed SSE line
        }
      }
    }
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const base = this.resolveBase(baseUrl);
    try {
      const res = await fetch(`${base}/models`, { headers: this.headers(apiKey) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as {
        data?: Array<{ id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; top_provider?: { context_length?: number } }>;
      };
      const rows = json.data ?? [];
      return rows.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? m.top_provider?.context_length ?? 32768,
        // OpenRouter exposes pricing; other routers may not — treat unknown as non-free.
        isFree: m.pricing ? isFreePricing(m.pricing) : false,
        provider: this.id,
      }));
    } catch {
      // Offline fallback: curated list for this provider.
      return CURATED_FREE_MODELS.filter((m) => m.provider === this.id).map((m) => ({ ...m, isFree: true }));
    }
  }
}
