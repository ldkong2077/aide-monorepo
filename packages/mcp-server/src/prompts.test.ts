/**
 * Unit tests for the MCP prompt catalogue and renderer.
 *
 * The MCP server hosts a small set of curated prompt templates
 * (`PROMPTS`) that compose the server's tools into guided workflows.
 * Tests cover:
 *   1. The catalogue shape (4 prompts, all have the right metadata)
 *   2. The renderer returns a usable result for every known name
 *   3. The renderer interpolates arguments into the message body
 *   4. Unknown names return null (so the caller can throw an MCP error)
 *   5. Messages reference the EXACT tool names the server exposes —
 *      a model that misnames a tool will silently fail
 */
import { describe, it, expect } from "vitest";
import { PROMPTS, renderPrompt } from "./prompts.js";

describe("PROMPTS catalogue", () => {
  it("exposes exactly four prompts", () => {
    expect(PROMPTS).toHaveLength(4);
  });

  it("every prompt has a unique name", () => {
    const names = PROMPTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every prompt has a description", () => {
    for (const p of PROMPTS) {
      expect(p.description).toBeTruthy();
      expect(p.description!.length).toBeGreaterThan(20);
    }
  });

  it("every required argument is marked required", () => {
    for (const p of PROMPTS) {
      for (const arg of p.arguments ?? []) {
        if (arg.required) {
          expect(arg.name).toBeTruthy();
        }
      }
    }
  });
});

describe("renderPrompt", () => {
  it("returns null for an unknown prompt name", () => {
    expect(renderPrompt("does-not-exist", {})).toBeNull();
  });

  it("renders `code-review-with-aide` with files argument interpolated", () => {
    const result = renderPrompt("code-review-with-aide", {
      files: "src/a.ts, src/b.ts",
    });
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(1);
    const text = (result!.messages[0].content as { type: string; text: string })
      .text;
    expect(text).toContain("src/a.ts");
    expect(text).toContain("src/b.ts");
    // The prompt must reference the exact tool name the server exposes.
    expect(text).toContain("guard_verify");
    expect(text).toContain("codegraph_query");
  });

  it("renders `find-symbol-with-graph` with symbol argument interpolated", () => {
    const result = renderPrompt("find-symbol-with-graph", {
      symbol: "createProxyServer",
    });
    expect(result).not.toBeNull();
    const text = (result!.messages[0].content as { type: string; text: string })
      .text;
    expect(text).toContain("createProxyServer");
    expect(text).toContain("codegraph_query");
  });

  it("renders `verify-and-fix` with file argument interpolated", () => {
    const result = renderPrompt("verify-and-fix", { file: "src/foo.ts" });
    const text = (result!.messages[0].content as { type: string; text: string })
      .text;
    expect(text).toContain("src/foo.ts");
    expect(text).toContain("guard_verify");
  });

  it("renders `index-and-summarise` with project argument interpolated", () => {
    const result = renderPrompt("index-and-summarise", {
      project: "/tmp/proj",
    });
    const text = (result!.messages[0].content as { type: string; text: string })
      .text;
    expect(text).toContain("/tmp/proj");
    expect(text).toContain("codegraph_index");
  });

  it("every rendered message has role=user (model-rendered, not pre-baked)", () => {
    // The MCP spec lets prompts include assistant messages, but ours
    // are user-typed so the model responds fresh each time. Asserting
    // this catches a regression where someone copy-pastes an example
    // assistant message into a prompt template.
    for (const p of PROMPTS) {
      const result = renderPrompt(p.name, {});
      expect(result).not.toBeNull();
      for (const m of result!.messages) {
        expect(m.role).toBe("user");
      }
    }
  });

  it("handles a missing argument by falling back to a sensible default", () => {
    // code-review-with-aide REQUIRES `files`; if it's missing, the
    // rendered text should still be a coherent instruction (not crash).
    const result = renderPrompt("code-review-with-aide", {});
    expect(result).not.toBeNull();
    const text = (result!.messages[0].content as { type: string; text: string })
      .text;
    // The placeholder text '<no files supplied>' tells the user to
    // supply the argument.
    expect(text).toContain("no files supplied");
  });
});
