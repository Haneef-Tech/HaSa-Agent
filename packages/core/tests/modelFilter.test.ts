import { describe, expect, it } from "vitest";
import { isChatModel, onlyChatModels } from "../src/providers/freeModels.js";

describe("isChatModel", () => {
  it("keeps real chat models", () => {
    expect(isChatModel({ id: "qwen/qwen3:free" })).toBe(true);
    expect(isChatModel({ id: "gemini-2.5-flash", name: "Gemini" })).toBe(true);
    expect(isChatModel({ id: "allam-2-7b" })).toBe(true);
  });
  it("drops speech/guard/tts/embeddings models from pickers", () => {
    expect(isChatModel({ id: "whisper-large-v3" })).toBe(false);
    expect(isChatModel({ id: "meta-llama/llama-prompt-guard-2-22m" })).toBe(false);
    expect(isChatModel({ id: "openai/gpt-oss-safeguard-20b" })).toBe(false);
    expect(isChatModel({ id: "canopylabs/orpheus-arabic-saudi" })).toBe(false);
    expect(isChatModel({ id: "gemini-2.5-flash-image" })).toBe(false);
    expect(isChatModel({ id: "gemini-2.5-flash-preview-tts" })).toBe(false);
  });
  it("onlyChatModels filters cached lists but never empties them", () => {
    const mixed = [{ id: "gemini-3-flash" }, { id: "whisper-large-v3" }];
    expect(onlyChatModels(mixed).map((m) => m.id)).toEqual(["gemini-3-flash"]);
    const allJunk = [{ id: "whisper-large-v3" }];
    expect(onlyChatModels(allJunk)).toEqual(allJunk);
  });
});
