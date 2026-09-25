import { AnthropicProvider } from "./anthropic.js";
import { GenericRouterProvider } from "./genericRouter.js";
import { GeminiProvider } from "./gemini.js";
import { NaraProvider } from "./nara.js";
import { ZenProvider } from "./zen.js";
import { GroqProvider } from "./groq.js";
import type { ModelProvider } from "./types.js";

const BUILTINS: ModelProvider[] = [new NaraProvider(), new ZenProvider(), new GeminiProvider(), new AnthropicProvider(), new GroqProvider()];

/** Resolve a provider by id. `customBaseUrl` pins the generic router's host. */
export function getProvider(id: string, customBaseUrl?: string): ModelProvider {
  const found = BUILTINS.find((p) => p.id === id);
  if (found) return found;
  if (id === "openai-compatible") {
    if (!customBaseUrl) return new GenericRouterProvider([]);
    const host = new URL(customBaseUrl).hostname;
    return GenericRouterProvider.forHost(host);
  }
  throw new Error(`Unknown provider "${id}". Known: ${[...BUILTINS.map((p) => p.id), "openai-compatible"].join(", ")}`);
}

export function listProviderIds(): string[] {
  return [...BUILTINS.map((p) => p.id), "openai-compatible"];
}
