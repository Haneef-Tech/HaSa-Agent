import type { JsonSchema } from "../types.js";

/** Config file schema (stored at ~/.hasa/config.json, chmod 600). */
export interface HasaConfig {
  provider: string;
  model: string;
  apiKeys: Record<string, string>;
  providers?: Record<string, { baseUrl?: string; apiKey?: string }>;
  permissions?: {
    defaultPolicy?: "ask" | "allow" | "deny";
    alwaysAllow?: string[];
    alwaysDeny?: string[];
  };
  rpc?: { port?: number };
}

export const DEFAULT_CONFIG: HasaConfig = {
  provider: "nara",
  model: "ling-3.0-flash-sante-free",
  apiKeys: {},
  permissions: { defaultPolicy: "ask", alwaysAllow: [], alwaysDeny: [] },
};

const KNOWN_PROVIDERS = ["nara", "zen", "gemini", "anthropic", "groq", "openai-compatible"];

export function validateConfig(raw: unknown): { ok: true; config: HasaConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["config must be an object"] };
  const r = raw as Record<string, unknown>;
  if (typeof r["provider"] !== "string" || !KNOWN_PROVIDERS.includes(r["provider"] as string)) {
    errors.push(`provider must be one of: ${KNOWN_PROVIDERS.join(", ")}`);
  }
  if (typeof r["model"] !== "string" || (r["model"] as string).length === 0) {
    errors.push("model must be a non-empty string");
  }
  if (r["apiKeys"] !== undefined && (typeof r["apiKeys"] !== "object" || r["apiKeys"] === null)) {
    errors.push("apiKeys must be an object");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, config: { ...DEFAULT_CONFIG, ...(r as Partial<HasaConfig>) } };
}

export function configToToolSchemaDoc(): JsonSchema {
  return {
    type: "object",
    properties: {
      provider: { type: "string", description: "Provider id" },
      model: { type: "string", description: "Model id" },
    },
    required: ["provider", "model"],
  };
}
