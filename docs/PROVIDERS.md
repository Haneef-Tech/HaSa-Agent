# Providers (BYOK + free-model routing)

All providers implement `ModelProvider` (`packages/core/src/providers/types.ts`).

| ID | Host | Notes |
|---|---|---|
| `nara` | `router.bynara.id` | Default. Nara router (`https://router.bynara.id/v1`). Key via `hasa setup` or `NARA_API_KEY`. |
| `zen` | `opencode.ai` | OpenCode Zen (`https://opencode.ai/zen/v1`). Key from `opencode.ai/auth` or `ZEN_API_KEY`. Free models end in `-free`. Note: Zen free-tier `-free` models only answer inside OpenCode's own app (403 `FreeTierError` elsewhere) — use paid Zen models or another provider for HASA. |
| `gemini` | `generativelanguage.googleapis.com` | Google AI Studio free tier. Key from `aistudio.google.com/apikey` or `GEMINI_API_KEY`. |
| `anthropic` | `api.anthropic.com` | Messages API adapter. `ANTHROPIC_API_KEY`. |
| `groq` | `api.groq.com` | `GROQ_API_KEY`. Free tier. |
| `openai-compatible` | custom | Any OpenAI-compatible base URL. Set `HASA_ROUTER_BASE_URL=https://<host>/v1` + `HASA_ROUTER_API_KEY=...`, or `config.providers["openai-compatible"].baseUrl`. Host is pinned at runtime; other hosts are refused. |

## Adding a new router

1. If it's OpenAI-compatible (`POST {baseUrl}/chat/completions`, `GET {baseUrl}/models`): **no code change needed** — use the `openai-compatible` provider with `HASA_ROUTER_BASE_URL` + `HASA_ROUTER_API_KEY`.
2. For a first-class entry (pinned host, own id, curated free models): subclass `OpenAICompatibleProvider` like `nara.ts` (set `id`, `allowedHosts`, `defaultBaseUrl`), register in `registry.ts`, add the id to `KNOWN_PROVIDERS` + env map + `PROVIDER_IDS`, add a test.

## Free-model discovery

`listModels()` → `GET {base}/models` → filter `pricing.prompt == 0 && pricing.completion == 0` → cache 24h in `~/.hasa/models-<provider>.json`. Offline → `CURATED_FREE_MODELS` fallback.
