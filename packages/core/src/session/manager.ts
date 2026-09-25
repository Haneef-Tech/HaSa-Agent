import type { ChatMessage } from "../types.js";
import { saveTranscript, transcriptPath } from "./transcript.js";

export interface SessionMeta {
  id: string;
  cwd: string;
  provider: string;
  model: string;
  createdAt: number;
}

/** In-memory conversation + JSON transcript on disk (see transcript.ts). */
export class SessionManager {
  readonly meta: SessionMeta;
  private messages: ChatMessage[] = [];

  constructor(meta: SessionMeta) {
    this.meta = meta;
  }

  static create(cwd: string, provider: string, model: string): SessionManager {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    return new SessionManager({ id, cwd, provider, model, createdAt: Date.now() });
  }

  add(m: ChatMessage): void {
    this.messages.push(m);
  }

  history(): ChatMessage[] {
    return [...this.messages];
  }

  transcriptPath(): string {
    return transcriptPath(this.meta.id);
  }

  async persist(): Promise<void> {
    await saveTranscript(this.meta, this.messages);
  }
}
