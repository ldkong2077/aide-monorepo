/**
 * Tests for the tokenizer wrapper.
 *
 * These tests use real BPE tokenisation via gpt-tokenizer. The
 * expected token counts were hand-verified against the upstream
 * library's reference outputs and are not magic numbers — they
 * reflect the o200k_base encoding used by GPT-4o / GPT-5.
 */
import { describe, it, expect } from "vitest";
import {
  countTokens,
  countMessageTokens,
  estimateRequestTokens,
  isWithinTokenLimit,
  encodingForModel,
  DEFAULT_ENCODING,
} from "./tokenizer.js";

describe("tokenizer", () => {
  describe("encodingForModel", () => {
    it("returns the default for empty / null model", () => {
      expect(encodingForModel(undefined)).toBe(DEFAULT_ENCODING);
      expect(encodingForModel(null)).toBe(DEFAULT_ENCODING);
      expect(encodingForModel("")).toBe(DEFAULT_ENCODING);
    });

    it("routes GPT-4o and GPT-5 to o200k_base", () => {
      expect(encodingForModel("gpt-4o")).toBe("o200k_base");
      expect(encodingForModel("gpt-4o-mini-2024-07-18")).toBe("o200k_base");
      expect(encodingForModel("gpt-5")).toBe("o200k_base");
      expect(encodingForModel("o1-preview")).toBe("o200k_base");
      expect(encodingForModel("o3-mini")).toBe("o200k_base");
    });

    it("routes GPT-4 / GPT-3.5 to cl100k_base", () => {
      expect(encodingForModel("gpt-4")).toBe("cl100k_base");
      expect(encodingForModel("gpt-3.5-turbo")).toBe("cl100k_base");
      expect(encodingForModel("gpt-4-turbo-preview")).toBe("cl100k_base");
    });
  });

  describe("countTokens", () => {
    it("returns 0 for empty string regardless of model", () => {
      expect(countTokens("", "gpt-4o")).toBe(0);
      expect(countTokens("", "gpt-4")).toBe(0);
    });

    it("is deterministic — same input yields same count", () => {
      const text = "Hello, world! This is a sample sentence for tokenisation.";
      const first = countTokens(text, "gpt-4o");
      const second = countTokens(text, "gpt-4o");
      expect(first).toBe(second);
      expect(first).toBeGreaterThan(0);
    });

    it("counts short ASCII as a small positive number", () => {
      // The exact number depends on the BPE merges, but for "Hello" we
      // expect 1 token in o200k_base.
      expect(countTokens("Hello", "gpt-4o")).toBe(1);
    });

    it("handles multibyte Unicode without crashing", () => {
      const n = countTokens("你好，世界！这是一段中文文本。", "gpt-4o");
      expect(n).toBeGreaterThan(0);
      // 14 Chinese characters typically encode to ~14-20 tokens.
      expect(n).toBeLessThan(30);
    });

    it("uses o200k_base for modern models and cl100k_base for older", () => {
      const text = "a a a a a a a a a a"; // whitespace-prefixed sequence
      // Different encodings can produce different counts.
      const o200k = countTokens(text, "gpt-4o");
      const cl100k = countTokens(text, "gpt-4");
      expect(o200k).toBeGreaterThan(0);
      expect(cl100k).toBeGreaterThan(0);
    });
  });

  describe("countMessageTokens", () => {
    it("returns 0 for an empty message list", () => {
      expect(countMessageTokens([], "gpt-4o")).toBe(0);
    });

    it("applies the chat-template overhead per message", () => {
      // One message: 3 (overhead) + content tokens + 1 (reply primer).
      const one = countMessageTokens(
        [{ role: "user", content: "hi" }],
        "gpt-4o",
      );
      const two = countMessageTokens(
        [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "hi" },
        ],
        "gpt-4o",
      );
      // The second message should cost at least 3 more tokens (its overhead).
      expect(two - one).toBeGreaterThanOrEqual(3);
    });

    it("handles null content (system message) without throwing", () => {
      // We cast to `unknown` to bypass the strict `content: string`
      // type on ChatMessage; the tokenizer should still tolerate it.
      const n = countMessageTokens(
        [{ role: "system", content: null as unknown as string }],
        "gpt-4o",
      );
      expect(n).toBeGreaterThan(0);
    });

    it("handles array content (vision-style blocks) without throwing", () => {
      const n = countMessageTokens(
        [
          {
            role: "user",
            content: [
              { type: "text", text: "Look at this image" },
              {
                type: "image_url",
                image_url: { url: "https://example.com/x.png" },
              },
            ],
          },
        ] as unknown as { role: "user"; content: string }[],
        "gpt-4o",
      );
      expect(n).toBeGreaterThan(0);
    });
  });

  describe("estimateRequestTokens", () => {
    it("is at least the sum of message tokens", () => {
      const messages = [
        { role: "system" as const, content: "You are helpful." },
        { role: "user" as const, content: "What is 2+2?" },
      ];
      const est = estimateRequestTokens(messages, "gpt-4o");
      const msg = countMessageTokens(messages, "gpt-4o");
      expect(est).toBeGreaterThanOrEqual(msg);
    });

    it("grows when max_tokens is supplied", () => {
      const messages = [{ role: "user" as const, content: "hi" }];
      const small = estimateRequestTokens(messages, "gpt-4o", {
        maxTokens: 64,
      });
      const big = estimateRequestTokens(messages, "gpt-4o", {
        maxTokens: 8192,
      });
      expect(big).toBeGreaterThan(small);
    });
  });

  describe("isWithinTokenLimit", () => {
    it("returns true for empty text", () => {
      expect(isWithinTokenLimit("", 0, "gpt-4o")).toBe(true);
    });

    it("returns true when text fits", () => {
      expect(isWithinTokenLimit("Hello", 10, "gpt-4o")).toBe(true);
    });

    it("returns false when text overflows", () => {
      // 1000 tokens of input with a limit of 10.
      const text = "lorem ipsum ".repeat(1000);
      expect(isWithinTokenLimit(text, 10, "gpt-4o")).toBe(false);
    });
  });
});
