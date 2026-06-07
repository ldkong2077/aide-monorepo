/**
 * Unit tests for the SSE streaming utilities in proxy/stream.ts.
 *
 * These functions are pure logic and operate on injected async iterables,
 * so they can be tested without spinning up the Fastify server.
 */
import { describe, it, expect } from "vitest";
import {
  parseRawSSEStream,
  extractTokenUsageFromSSE,
  extractTokenUsageFromAnthropicSSE,
  estimateTokenUsage,
} from "./stream.js";
import type { SSEEvent } from "../types.js";

// Helper: build an async iterable from an array of Uint8Array chunks.
async function* chunksToBytes(chunks: string[]): AsyncGenerator<Uint8Array> {
  for (const c of chunks) yield new TextEncoder().encode(c);
}

// Helper: collect all events from an async iterable into an array.
async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("parseRawSSEStream", () => {
  it("parses a single OpenAI-style event", async () => {
    const events = collect(
      parseRawSSEStream(
        chunksToBytes([
          'data: {"id":"abc","object":"chat.completion.chunk"}\n\n',
        ]),
      ),
    );
    expect(await events).toEqual([
      { data: '{"id":"abc","object":"chat.completion.chunk"}' },
    ]);
  });

  it("parses an Anthropic-style event with event: prefix", async () => {
    const events = collect(
      parseRawSSEStream(
        chunksToBytes([
          'event: message_start\ndata: {"type":"message_start"}\n\n',
        ]),
      ),
    );
    expect(await events).toEqual([
      { event: "message_start", data: '{"type":"message_start"}' },
    ]);
  });

  it("stops at the [DONE] sentinel (OpenAI)", async () => {
    const events = collect(
      parseRawSSEStream(
        chunksToBytes(['data: {"a":1}\n\ndata: [DONE]\n\ndata: {"a":2}\n\n']),
      ),
    );
    expect(await events).toEqual([{ data: '{"a":1}' }]);
  });

  it("concatenates multi-line data: fields with newline separator", async () => {
    const events = collect(
      parseRawSSEStream(
        chunksToBytes(["data: line1\ndata: line2\ndata: line3\n\n"]),
      ),
    );
    expect(await events).toEqual([{ data: "line1\nline2\nline3" }]);
  });

  it("ignores id: and retry: fields", async () => {
    const events = collect(
      parseRawSSEStream(
        chunksToBytes(['id: 42\nretry: 1000\ndata: {"ok":true}\n\n']),
      ),
    );
    expect(await events).toEqual([{ data: '{"ok":true}' }]);
  });

  it("handles chunks that split a single event across boundaries", async () => {
    // The first chunk ends mid-line; the second completes the line.
    const events = collect(
      parseRawSSEStream(chunksToBytes(['data: {"a":', "1}\n\n"])),
    );
    expect(await events).toEqual([{ data: '{"a":1}' }]);
  });

  it("emits a final event from leftover buffer when stream ends without trailing blank line", async () => {
    const events = collect(parseRawSSEStream(chunksToBytes(['data: {"x":7}'])));
    expect(await events).toEqual([{ data: '{"x":7}' }]);
  });

  it("yields no events for an empty stream", async () => {
    const events = collect(parseRawSSEStream(chunksToBytes([])));
    expect(await events).toEqual([]);
  });
});

describe("extractTokenUsageFromSSE (OpenAI)", () => {
  it("returns null when no events contain usage", () => {
    const events: SSEEvent[] = [
      { data: '{"id":"abc"}' },
      { data: '{"choices":[]}' },
    ];
    expect(extractTokenUsageFromSSE(events)).toBeNull();
  });

  it("extracts usage from the last event that has it", () => {
    const events: SSEEvent[] = [
      { data: '{"choices":[]}' },
      {
        data: '{"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}',
      },
      { data: '{"choices":[]}' },
    ];
    expect(extractTokenUsageFromSSE(events)).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    });
  });

  it("skips malformed JSON events without throwing", () => {
    const events: SSEEvent[] = [
      { data: "not-json" },
      {
        data: '{"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}',
      },
    ];
    expect(extractTokenUsageFromSSE(events)).toEqual({
      prompt_tokens: 5,
      completion_tokens: 7,
      total_tokens: 12,
    });
  });

  it("returns null for empty event list", () => {
    expect(extractTokenUsageFromSSE([])).toBeNull();
  });
});

describe("extractTokenUsageFromAnthropicSSE", () => {
  it("extracts usage from message_start (Anthropic)", () => {
    const events: SSEEvent[] = [
      {
        data: JSON.stringify({
          type: "message_start",
          message: { usage: { input_tokens: 100, output_tokens: 0 } },
        }),
      },
    ];
    expect(extractTokenUsageFromAnthropicSSE(events)).toEqual({
      prompt_tokens: 100,
      completion_tokens: 0,
      total_tokens: 100,
    });
  });

  it("extracts usage from message_delta (Anthropic)", () => {
    const events: SSEEvent[] = [
      { data: '{"type":"content_block_start"}' },
      {
        data: JSON.stringify({
          type: "message_delta",
          usage: { output_tokens: 42 },
        }),
      },
    ];
    expect(extractTokenUsageFromAnthropicSSE(events)).toEqual({
      prompt_tokens: 0,
      completion_tokens: 42,
      total_tokens: 42,
    });
  });

  it("returns null when no event has usage", () => {
    const events: SSEEvent[] = [
      { data: '{"type":"content_block_delta"}' },
      { data: '{"type":"message_stop"}' },
    ];
    expect(extractTokenUsageFromAnthropicSSE(events)).toBeNull();
  });
});

describe("estimateTokenUsage", () => {
  it("estimates English text at roughly 1 token per 4 characters", () => {
    const usage = estimateTokenUsage("hello world", "");
    // 11 chars / 4 = 2.75 → ceil = 3
    expect(usage.prompt_tokens).toBe(3);
    expect(usage.completion_tokens).toBe(0);
    expect(usage.total_tokens).toBe(3);
  });

  it("estimates CJK text at roughly 1 token per 2 characters", () => {
    const usage = estimateTokenUsage("你好世界", "");
    // 4 CJK chars / 2 = 2
    expect(usage.prompt_tokens).toBe(2);
  });

  it("sums prompt and completion tokens", () => {
    const usage = estimateTokenUsage("hi", "world");
    expect(usage.total_tokens).toBe(
      usage.prompt_tokens + usage.completion_tokens,
    );
  });

  it("handles empty strings without throwing", () => {
    expect(estimateTokenUsage("", "")).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  });

  it("handles mixed Chinese and English text", () => {
    const usage = estimateTokenUsage("hello 世界", "");
    // 6 ASCII chars / 4 = 1.5 → ceil = 2; 2 CJK / 2 = 1 → total = 3
    expect(usage.prompt_tokens).toBe(3);
  });
});
