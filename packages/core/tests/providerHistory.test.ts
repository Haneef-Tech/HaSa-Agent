import { afterEach, describe, expect, it, vi } from "vitest";
import { NaraProvider } from "../src/providers/nara.js";

describe("assistant tool_calls replay (multi-step tools)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes tool_calls on assistant messages so Gemini-style endpoints accept tool history", async () => {
    let body: { messages: Array<Record<string, unknown>> } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        body = JSON.parse(init.body) as { messages: Array<Record<string, unknown>> };
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "done" } }], model: "m" }), { status: 200 }));
      }),
    );
    const p = new NaraProvider();
    await p.chat(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", args: { path: "a" } }] },
        { role: "tool", content: "obs", name: "read_file", toolCallId: "c1" },
      ],
      { model: "m", apiKey: "k" },
    );
    const msgs = (body as unknown as { messages: Array<Record<string, unknown>> }).messages;
    const asst = msgs.find((m) => m["role"] === "assistant") as unknown as { tool_calls: Array<{ function: { name: string } }> };
    expect(asst.tool_calls[0]?.function.name).toBe("read_file");
    const tool = msgs.find((m) => m["role"] === "tool") as unknown as { tool_call_id: string };
    expect(tool.tool_call_id).toBe("c1");
  });

  it("retries without tools when the model rejects function calling (some Groq models)", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        if (bodies.length === 1) {
          return Promise.resolve(new Response('{"error":{"message":"`tool calling` is not supported"}}', { status: 400 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "done" } }], model: "m" }), { status: 200 }));
      }),
    );
    const p = new NaraProvider();
    const r = await p.chat([{ role: "user", content: "hi" }], {
      model: "m",
      apiKey: "k",
      tools: [{ name: "read_file", description: "r", parameters: { type: "object", properties: {} } }],
    });
    expect(r.text).toBe("done");
    expect(bodies).toHaveLength(2);
    expect("tools" in (bodies[0] as Record<string, unknown>)).toBe(true);
    expect("tools" in (bodies[1] as Record<string, unknown>)).toBe(false);
  });

  it("replays the provider's raw tool_calls (thought signatures survive)", async () => {
    let body: { messages: Array<Record<string, unknown>> } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        body = JSON.parse(init.body) as { messages: Array<Record<string, unknown>> };
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "done" } }], model: "m" }), { status: 200 }));
      }),
    );
    const p = new NaraProvider();
    await p.chat(
      [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "c9",
              name: "run_shell",
              args: { command: "ls" },
              raw: { id: "c9", thoughtSignature: "abc123", function: { name: "run_shell", arguments: "{}" } },
            },
          ],
        },
        { role: "tool", content: "obs", name: "run_shell", toolCallId: "c9" },
      ],
      { model: "m", apiKey: "k" },
    );
    const msgs = (body as unknown as { messages: Array<Record<string, unknown>> }).messages;
    const asst = msgs.find((m) => m["role"] === "assistant") as unknown as { tool_calls: Array<Record<string, unknown>> };
    expect(asst.tool_calls[0]?.["thoughtSignature"]).toBe("abc123");
  });

  it("retries with smaller max_tokens when the model caps it", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        if (bodies.length === 1) {
          return Promise.resolve(new Response('{"error":{"message":"`max_tokens` must be less than or equal to `512`"}}', { status: 400 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "done" } }], model: "m" }), { status: 200 }));
      }),
    );
    const p = new NaraProvider();
    const r = await p.chat([{ role: "user", content: "hi" }], { model: "m", apiKey: "k" });
    expect(r.text).toBe("done");
    expect(bodies).toHaveLength(2);
    expect((bodies[0] as Record<string, unknown>)["max_tokens"]).toBe(4096);
    expect((bodies[1] as Record<string, unknown>)["max_tokens"]).toBe(512);
  });

  it("turns a free-tier 403 into a actionable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error":{"type":"FreeTierError"}}', { status: 403 })),
    );
    const p = new NaraProvider();
    await expect(p.chat([{ role: "user", content: "hi" }], { model: "m", apiKey: "k" })).rejects.toThrow(/free-tier/i);
  });
});
