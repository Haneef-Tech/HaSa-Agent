import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ChatMessage } from "../types.js";
import type { SessionMeta } from "./manager.js";

export interface TranscriptFile {
  meta: SessionMeta;
  messages: ChatMessage[];
}

/** Where transcripts live: ~/.hasa/sessions/*.json (or HASA_CONFIG_DIR/sessions). */
export function sessionsDir(): string {
  return process.env["HASA_CONFIG_DIR"] ? path.join(process.env["HASA_CONFIG_DIR"], "sessions") : path.join(os.homedir(), ".hasa", "sessions");
}

export function transcriptPath(sessionId: string): string {
  return path.join(sessionsDir(), `${sessionId}.json`);
}

/** Append-only write of the full session transcript (debuggability + audit). */
export async function saveTranscript(meta: SessionMeta, messages: ChatMessage[]): Promise<string> {
  const dir = sessionsDir();
  await fs.mkdir(dir, { recursive: true });
  const file: TranscriptFile = { meta, messages };
  const p = transcriptPath(meta.id);
  await fs.writeFile(p, JSON.stringify(file, null, 2));
  return p;
}

/** Load a past transcript by session id (used by the session-history browser). */
export async function loadTranscript(sessionId: string): Promise<TranscriptFile> {
  const raw = await fs.readFile(transcriptPath(sessionId), "utf8");
  return JSON.parse(raw) as TranscriptFile;
}

/** List all saved session ids, newest first. */
export async function listTranscripts(): Promise<string[]> {
  try {
    const files = await fs.readdir(sessionsDir());
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
