import type { AssistantResult, ChatMessage, JsonSchema } from "../types.js";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ChatOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  systemPrompt?: string;
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
  /** Abort a hung request (free tiers can stall). */
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
  provider: string;
}

export interface ModelProvider {
  readonly id: string;
  /** Pinned HTTPS host(s). Requests to any other host are refused. */
  readonly allowedHosts: string[];
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<AssistantResult>;
  chatStream(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<string>;
  listModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]>;
}
