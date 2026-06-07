/**
 * End-to-end test for the MCP server over stdio.
 *
 * Spawns the actual `aide mcp serve` subprocess and exchanges a few
 * real JSON-RPC messages with it. This catches regressions that the
 * in-process unit tests miss:
 *   - Transport framing (the SDK writes a Content-Length header per
 *     message; if our `stdio` setup is wrong the host sees garbage)
 *   - Subprocess startup cost and module resolution
 *   - The capabilities we advertise match what we actually implement
 *
 * The test is bounded by a hard wall-clock timeout so a hung child
 * never wedges CI.
 */
import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const CLI_BIN = pathResolve(__dirname, "..", "..", "cli", "dist", "bin.js");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Spawn the MCP server, then drive it with a small JSON-RPC session.
 * Returns the first response for each request sent.
 */
async function withServer<T>(
  fn: (
    send: (req: Record<string, unknown>) => Promise<JsonRpcResponse>,
  ) => Promise<T>,
): Promise<T> {
  if (!existsSync(CLI_BIN)) {
    throw new Error(
      `CLI binary not found at ${CLI_BIN}. Run "npm run build" before running this test.`,
    );
  }

  const proc = spawn(process.execPath, [CLI_BIN, "mcp", "serve"], {
    stdio: ["pipe", "pipe", "pipe"],
    // IMPORTANT: do NOT inherit env from the test runner. Some env vars
    // (e.g. AIDE_*) change server behaviour; the subprocess should start
    // from a clean slate.
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  }) as ChildProcessWithoutNullStreams;

  // Buffer stdout line-by-line. The MCP SDK writes each JSON-RPC
  // message as one line of JSON, then flushes. We split on '\n'.
  const stdoutLines: string[] = [];
  proc.stdout.setEncoding("utf-8");
  proc.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) stdoutLines.push(line);
    }
  });

  // Capture stderr so the test failure message can show why the
  // server crashed (the SDK uses stderr for the "started" line).
  let stderr = "";
  proc.stderr.setEncoding("utf-8");
  proc.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  // Wait for the startup banner on stderr before sending any requests.
  // The banner is the SDK's "AIDE MCP server started on stdio" line.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`Server did not start within 10s. stderr: ${stderr}`)),
      10_000,
    );
    proc.stderr.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  let nextId = 1;
  const send = async (
    req: Record<string, unknown>,
  ): Promise<JsonRpcResponse> => {
    const id = nextId++;
    const message = JSON.stringify({ jsonrpc: "2.0", id, ...req });
    proc.stdin.write(message + "\n");

    // Wait for the matching response. Drain lines until one carries
    // our id; everything else (notifications, server-initiated events)
    // is discarded for this test.
    const start = Date.now();
    while (Date.now() - start < 5_000) {
      const idx = stdoutLines.findIndex((line) => {
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          return parsed.id === id;
        } catch {
          return false;
        }
      });
      if (idx !== -1) {
        const line = stdoutLines[idx];
        stdoutLines.splice(idx, 1);
        return JSON.parse(line) as JsonRpcResponse;
      }
      // Yield to the event loop so the 'data' handler can run.
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(
      `Timed out waiting for response to ${req.method ?? JSON.stringify(req)}`,
    );
  };

  try {
    return await fn(send);
  } finally {
    proc.stdin.end();
    proc.kill();
    // Wait briefly for the process to exit so we don't leak handles.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 2_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

describe("MCP server (stdio e2e)", () => {
  let proc: ChildProcessWithoutNullStreams | null = null;

  afterEach(() => {
    // Safety net: if `withServer` errored before its `finally`, kill
    // the stray process so the test runner doesn't hang.
    if (proc) {
      proc.kill("SIGKILL");
      proc = null;
    }
  });

  it("responds to initialize with server info + capabilities", async () => {
    await withServer(async (send) => {
      const res = await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      expect(res.error).toBeUndefined();
      const result = res.result as {
        serverInfo: { name: string; version: string };
        capabilities: { tools?: object; prompts?: object; resources?: object };
      };
      expect(result.serverInfo.name).toBe("aide-mcp-server");
      expect(result.serverInfo.version).toBeTruthy();
      // We must advertise every capability we implemented, otherwise
      // the client will refuse to send those request types.
      expect(result.capabilities.tools).toBeDefined();
      expect(result.capabilities.prompts).toBeDefined();
      expect(result.capabilities.resources).toBeDefined();
    });
  });

  it("lists all 5 tools over stdio", async () => {
    await withServer(async (send) => {
      // initialize first (required by the spec)
      await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      const res = await send({ method: "tools/list" });
      expect(res.error).toBeUndefined();
      const tools = (res.result as { tools: { name: string }[] }).tools;
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "codegraph_index",
        "codegraph_query",
        "guard_check",
        "guard_verify",
        "mind_process",
      ]);
    });
  });

  it("lists all 4 prompts over stdio", async () => {
    await withServer(async (send) => {
      await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      const res = await send({ method: "prompts/list" });
      expect(res.error).toBeUndefined();
      const prompts = (res.result as { prompts: { name: string }[] }).prompts;
      const names = prompts.map((p) => p.name).sort();
      expect(names).toEqual([
        "code-review-with-aide",
        "find-symbol-with-graph",
        "index-and-summarise",
        "verify-and-fix",
      ]);
    });
  });

  it("lists all 3 resources over stdio", async () => {
    await withServer(async (send) => {
      await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      const res = await send({ method: "resources/list" });
      expect(res.error).toBeUndefined();
      const resources = (res.result as { resources: { uri: string }[] })
        .resources;
      const uris = resources.map((r) => r.uri).sort();
      expect(uris).toEqual([
        "aide://config",
        "aide://graph/stats",
        "aide://health",
      ]);
    });
  });

  it("reads the aide://health resource and returns valid JSON", async () => {
    await withServer(async (send) => {
      await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      const res = await send({
        method: "resources/read",
        params: { uri: "aide://health" },
      });
      expect(res.error).toBeUndefined();
      const contents = (
        res.result as { contents: { text: string; mimeType?: string }[] }
      ).contents;
      expect(contents).toHaveLength(1);
      expect(contents[0].mimeType).toBe("application/json");
      // Must be parseable JSON
      expect(() => JSON.parse(contents[0].text)).not.toThrow();
    });
  });

  it("returns a clean JSON-RPC error for an unknown method", async () => {
    await withServer(async (send) => {
      await send({
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "0.0.1" },
        },
      });
      const res = await send({ method: "this/does/not/exist" });
      // The MCP SDK throws on unknown methods, which the server turns
      // into a JSON-RPC error. We don't pin the exact error code (it
      // changed across SDK versions); we just require it to be present.
      expect(res.error).toBeDefined();
      expect(res.error!.code).toBeTypeOf("number");
    });
  });
});
