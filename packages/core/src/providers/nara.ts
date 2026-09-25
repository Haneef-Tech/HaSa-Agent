import { OpenAICompatibleProvider } from "./openaiCompatible.js";

/**
 * Nara router — OpenAI-compatible free-model router.
 * Default endpoint https://router.bynara.id/v1 (override via
 * HASA_ROUTER_BASE_URL won't apply here; this adapter pins Nara's host).
 * Key via `hasa setup` or NARA_API_KEY env var.
 */
export class NaraProvider extends OpenAICompatibleProvider {
  readonly id = "nara";
  readonly allowedHosts = ["router.bynara.id"];
  protected defaultBaseUrl(): string {
    return "https://router.bynara.id/v1";
  }
}
