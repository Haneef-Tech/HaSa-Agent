import { OpenAICompatibleProvider } from "./openaiCompatible.js";
import type { AssistantResult, ChatMessage } from "../types.js";
import type { ChatOptions, ModelInfo } from "./types.js";

/**
 * Google AI Studio (Gemini) via its OpenAI-compatible endpoint.
 * Free tier with generous limits; key from https://aistudio.google.com/apikey
 * (or GEMINI_API_KEY env var). Also selectable as `gemini` in `hasa setup`.
 */
export class GeminiProvider extends OpenAICompatibleProvider {
  readonly id = "gemini";
  readonly allowedHosts = ["generativelanguage.googleapis.com"];
  protected defaultBaseUrl(): string {
    return "https://generativelanguage.googleapis.com/v1beta/openai";
  }

  override async listModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const models = await super.listModels(apiKey, baseUrl);
    // The compat endpoint omits pricing, but AI Studio serves these on a $0
    // free tier — mark them free so the picker/setup surfaces them.
    // It also prefixes ids as "models/<id>" — strip that: chat needs the bare id.
    return models.map((m) => ({ ...m, id: m.id.replace(/^models\//, ""), isFree: true }));
  }

  override async chat(messages: ChatMessage[], opts: ChatOptions): Promise<AssistantResult> {
    // Tolerate saved configs like "models/gemini-2.5-flash" (seen in the wild).
    return super.chat(messages, { ...opts, model: opts.model.replace(/^models\//, "") });
  }
}
