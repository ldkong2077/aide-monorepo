/**
 * @aide/mcp-server — Zod schemas for MCP tool inputs.
 *
 * Each tool exposed via MCP has its argument shape described in JSON Schema
 * (the `inputSchema` field of the tool descriptor). The Zod schemas here are
 * the TypeScript-side mirror of those JSON Schemas and are used to parse
 * and validate the raw `arguments` field that arrives over the wire.
 *
 * Why Zod?
 *  - Single source of truth for validation
 *  - Type-safe access to parsed fields (no more `(args as any).foo`)
 *  - Runtime error messages with structured codes
 */
import { z } from 'zod';

/**
 * Common schema for an optional project root path. Defaults are applied at
 * the handler level; the schema itself is the strict contract.
 */
const projectPathSchema = z
  .string()
  .min(1, { message: 'Path must be a non-empty string' })
  .optional();

/** codegraph_index — build or refresh the code graph for a project. */
export const codegraphIndexArgsSchema = z.object({
  path: projectPathSchema,
});

/** codegraph_query — query the graph for symbols / references / definitions. */
export const codegraphQueryArgsSchema = z.object({
  query: z.string().min(1, { message: 'Query must be a non-empty string' }),
  kind: z.enum(['symbol', 'reference', 'definition']).optional().default('symbol'),
  path: projectPathSchema,
});

/**
 * guard_verify — verify one or more files.
 *
 * The two file arguments are mutually exclusive. `files` is plural; `file` is
 * singular. Providing both (or neither) is a validation error.
 *
 * Implemented with a `superRefine` over an object schema because `z.union`
 * matches the first arm and silently ignores the extra field, which would
 * let `{ file, files }` slip through. The refine runs after the base parse
 * and rejects any non-XOR combination.
 */
export const guardVerifyArgsSchema = z
  .object({
    file: z.string().min(1, { message: 'File must be a non-empty path' }).optional(),
    files: z
      .array(z.string().min(1))
      .min(1, { message: 'Files must be a non-empty array' })
      .optional(),
    noTest: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    const hasFile = v.file !== undefined;
    const hasFiles = v.files !== undefined;
    if (hasFile === hasFiles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exactly one of `file` or `files` must be provided',
        path: hasFile ? ['files'] : ['file'],
      });
    }
  })
  .transform((v) => ({
    files: v.file !== undefined ? [v.file] : v.files!,
    noTest: v.noTest,
  }));

/** guard_check — hallucination check on a single file. */
export const guardCheckArgsSchema = z.object({
  file: z.string().min(1, { message: 'File must be a non-empty path' }),
});

/** mind_process — project design and planning from ideas. */
export const mindProcessArgsSchema = z.object({
  idea: z.string().min(1, { message: 'Idea must be a non-empty string' }),
  outputDir: z.string().optional().default('docs/aide'),
  mode: z.enum(['brainstorm', 'plan', 'full']).optional().default('full'),
  sessionId: z.string().optional(),
});

/** Discriminated union of all tool argument shapes. */
export const toolArgsSchema = z.discriminatedUnion('tool', [
  z.object({ tool: z.literal('codegraph_index'), args: codegraphIndexArgsSchema }),
  z.object({ tool: z.literal('codegraph_query'), args: codegraphQueryArgsSchema }),
  z.object({ tool: z.literal('guard_verify'), args: guardVerifyArgsSchema }),
  z.object({ tool: z.literal('guard_check'), args: guardCheckArgsSchema }),
  z.object({ tool: z.literal('mind_process'), args: mindProcessArgsSchema }),
]);

/** Inferred TypeScript types. */
export type CodegraphIndexArgs = z.infer<typeof codegraphIndexArgsSchema>;
export type CodegraphQueryArgs = z.infer<typeof codegraphQueryArgsSchema>;
export type GuardVerifyArgs = z.infer<typeof guardVerifyArgsSchema>;
export type GuardCheckArgs = z.infer<typeof guardCheckArgsSchema>;
export type MindProcessArgs = z.infer<typeof mindProcessArgsSchema>;
export type ToolArgs = z.infer<typeof toolArgsSchema>;
