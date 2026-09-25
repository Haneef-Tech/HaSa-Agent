import { OpenAICompatibleProvider } from "./openaiCompatible.js";

/**
 * OpenCode Zen (https://opencode.ai) — OpenAI-compatible endpoint at
 * /zen/v1/chat/completions, model list at /zen/v1/models.
 * Key: sign in at opencode.ai/auth → Create API Key (or ZEN_API_KEY env var).
 * Free models (per Zen docs): minimax-m2.5-free, glm-5-free, kimi-k2.5-free.
 */
export class ZenProvider extends OpenAICompatibleProvider {
  readonly id = "zen";
  readonly allowedHosts = ["opencode.ai"];
  protected defaultBaseUrl(): string {
    return "https://opencode.ai/zen/v1";
  }
}
