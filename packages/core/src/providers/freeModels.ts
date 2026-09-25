/** Curated free-model fallback when the /models endpoint is unreachable (offline). */
export interface FreeModelEntry {
  provider: string;
  id: string;
  name: string;
  contextLength: number;
}

export const CURATED_FREE_MODELS: FreeModelEntry[] = [
  { provider: "groq", id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (Groq free tier)", contextLength: 131072 },
  { provider: "gemini", id: "gemini-3.6-flash", name: "Gemini 3.6 Flash (Google free tier, current)", contextLength: 1048576 },
  { provider: "gemini", id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview (Google free tier)", contextLength: 1048576 },
  { provider: "gemini", id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Google free tier)", contextLength: 1048576 },
  { provider: "nara", id: "ling-3.0-flash-sante-free", name: "Ling 3.0 Flash Sante (Nara free)", contextLength: 262144 },
  { provider: "zen", id: "minimax-m2.5-free", name: "MiniMax M2.5 Free (Zen free)", contextLength: 200000 },
  { provider: "zen", id: "glm-5-free", name: "GLM 5 Free (Zen free)", contextLength: 200000 },
  { provider: "zen", id: "kimi-k2.5-free", name: "Kimi K2.5 Free (Zen free)", contextLength: 200000 },
];

export function isFreePricing(pricing: { prompt?: string | number; completion?: string | number }): boolean {
  const p = Number(pricing.prompt ?? 1);
  const c = Number(pricing.completion ?? 1);
  return p === 0 && c === 0;
}

/** Drop non-chat modalities (speech-to-text, guardrails, TTS, embeddings)
 *  from model pickers — a coding agent can't chat through them. */
const NON_CHAT_RE = /whisper|guard|tts|transcrib|orpheus|embed|moderation|image|video-gen|music/i;

/** Model families the owner removed from this project. */
const REMOVED_RE = /z-ai|zhipu/i;

export function isChatModel(m: { id: string; name?: string }): boolean {
  return !NON_CHAT_RE.test(`${m.id} ${m.name ?? ""}`);
}

/** Filter a list (live OR cached) down to chat models. If everything would be
 *  dropped (odd provider), return the original list and let manual entry cope. */
export function onlyChatModels<T extends { id: string; name?: string }>(models: T[]): T[] {
  const allowed = models.filter((m) => !REMOVED_RE.test(`${m.id} ${m.name ?? ""}`));
  const kept = allowed.filter(isChatModel);
  if (kept.length > 0) return kept;
  return allowed.length > 0 ? allowed : models;
}
