import { OpenAICompatibleProvider } from "./openaiCompatible.js";

/**
 * Generic router for ANY OpenAI-compatible base URL — including the
 * placeholder "Nara router". The host is pinned at runtime from config:
 * pass `baseUrl` in ChatOptions; only https hosts are allowed.
 */
export class GenericRouterProvider extends OpenAICompatibleProvider {
  readonly id = "openai-compatible";
  readonly allowedHosts: string[];

  constructor(allowedHosts: string[] = []) {
    super();
    this.allowedHosts = allowedHosts;
  }

  protected defaultBaseUrl(): string {
    throw new Error("openai-compatible requires an explicit baseUrl (set HASA_ROUTER_BASE_URL or config.providers['openai-compatible'].baseUrl)");
  }

  /** Build a provider pinned to a single custom host. */
  static forHost(host: string): GenericRouterProvider {
    return new GenericRouterProvider([host]);
  }
}
