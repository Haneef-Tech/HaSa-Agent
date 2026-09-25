import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../src/providers/openaiCompatible.js";
import { parseFencedToolCalls, stripToolBlocks } from "../src/agent/toolParser.js";
import { validateConfig } from "../src/config/schema.js";
import { PermissionGate } from "../src/permissions/gate.js";
import { assertAllowedHost } from "../src/providers/openaiCompatible.js";
import { isFreePricing } from "../src/providers/freeModels.js";

describe("toolParser", () => {
  it("parses fenced tool blocks", () => {
    const calls = parseFencedToolCalls('```tool:read_file\n{"path": "a.ts"}\n```');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("read_file");
    expect(stripToolBlocks("hi\n```tool:read_file\n{}\n```")).toBe("hi");
  });
});

describe("config", () => {
  it("rejects unknown provider", () => {
    const r = validateConfig({ provider: "nope", model: "m", apiKeys: {} });
    expect(r.ok).toBe(false);
  });
  it("accepts nara", () => {
    const r = validateConfig({ provider: "nara", model: "x", apiKeys: {} });
    expect(r.ok).toBe(true);
  });
});

describe("gate", () => {
  it("denies without onAsk (safe default)", async () => {
    const g = new PermissionGate({ defaultPolicy: "ask", alwaysAllow: [], alwaysDeny: [] });
    await expect(g.check("write a", true)).resolves.toBe("deny");
  });
  it("remembers session allow", async () => {
    const g = new PermissionGate({ defaultPolicy: "ask", alwaysAllow: [], alwaysDeny: [], onAsk: async () => "session" });
    await expect(g.check("shell: ls", true)).resolves.toBe("allow");
    await expect(g.check("shell: ls", true)).resolves.toBe("allow");
  });
});

describe("security", () => {
  it("blocks untrusted hosts", () => {
    expect(() => assertAllowedHost("https://evil.com/v1", ["router.bynara.id"])).toThrow();
    expect(() => assertAllowedHost("https://router.bynara.id/v1", ["router.bynara.id"])).not.toThrow();
  });
  it("detects free pricing", () => {
    expect(isFreePricing({ prompt: "0", completion: "0" })).toBe(true);
    expect(isFreePricing({ prompt: "0.1", completion: "0" })).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("retries a 429 once, then returns the good response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://x.test/", {}, "test", 3);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("throws a friendly rate-limit error after 3 tries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 429 })));
    await expect(fetchWithRetry("https://x.test/", {}, "test", 3)).rejects.toThrow(/rate limit/i);
  });
});
