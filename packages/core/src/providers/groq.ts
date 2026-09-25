import { OpenAICompatibleProvider } from "./openaiCompatible.js";

export class GroqProvider extends OpenAICompatibleProvider {
  readonly id = "groq";
  readonly allowedHosts = ["api.groq.com"];
  protected defaultBaseUrl(): string {
    return "https://api.groq.com/openai/v1";
  }
}
