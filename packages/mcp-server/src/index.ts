/**
 * @aide/mcp-server — Unified MCP server exposing tools from all aide packages.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';


export interface AideMCPConfig {
  enableGraph?: boolean;
  enableGuard?: boolean;
  enableMind?: boolean;
}

const TOOLS: any[] = [
  {
    name: 'codegraph_index',
    description: 'Build or update the code graph for the current project',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project root path' },
      },
    },
  },
  {
    name: 'codegraph_query',
    description: 'Query the code graph for symbols, references, or definitions',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        kind: { type: 'string', enum: ['symbol', 'reference', 'definition'], description: 'Query type' },
        path: { type: 'string', description: 'Project root path' },
      },
      required: ['query'],
    },
  },
  {
    name: 'guard_verify',
    description: 'Verify AI-generated code for hallucinations and correctness',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'File paths to verify' },
        noTest: { type: 'boolean', description: 'Skip test execution' },
      },
      required: ['files'],
    },
  },
  {
    name: 'guard_check',
    description: 'Run hallucination check on a single file',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to check' },
      },
      required: ['file'],
    },
  },
  {
    name: 'mind_process',
    description: 'Process an idea into structured project files',
    inputSchema: {
      type: 'object',
      properties: {
        idea: { type: 'string', description: 'Raw idea text' },
        outputDir: { type: 'string', description: 'Output directory' },
      },
      required: ['idea'],
    },
  },
];

export async function startMCPServer(config: AideMCPConfig = {}): Promise<void> {
  const server = new Server(
    { name: 'aide-mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'codegraph_index': {
          const { CodeGraph } = await import('@aide/graph');
          const cg = await CodeGraph.init((args as any).path || '.');
          await cg.indexAll();
          return { content: [{ type: 'text', text: 'Indexing complete.' }] };
        }

        case 'codegraph_query': {
          const { CodeGraph } = await import('@aide/graph');
          const cg = await CodeGraph.open((args as any).path || '.');
          const query = (args as any).query;
          const kind = (args as any).kind || 'symbol';
          let results: any;
          switch (kind) {
            case 'symbol':
              results = cg.searchNodes(query);
              break;
            case 'reference':
              results = cg.findUsages(query);
              break;
            case 'definition':
              results = cg.getContext(query);
              break;
            default:
              results = cg.searchNodes(query);
          }
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }

        case 'guard_verify': {
          const { Verifier } = await import('@aide/guard');
          const verifier = new Verifier();
          const report = await verifier.verify({
            path: (args as any).files?.join(','),
            noTest: (args as any).noTest,
          });
          return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
        }

        case 'guard_check': {
          const { HallucinationDetector } = await import('@aide/guard');
          const fs = await import('fs');
          const pathMod = await import('path');
          const filePath = (args as any).file;
          const content = fs.readFileSync(filePath, 'utf-8');
          const ext = pathMod.extname(filePath).toLowerCase();
          const langMap: Record<string, string> = {
            '.py': 'python', '.ts': 'typescript', '.tsx': 'typescript',
            '.js': 'javascript', '.jsx': 'javascript', '.go': 'go',
          };
          const language = (langMap[ext] || 'unknown') as import('@aide/guard').Language;
          const projectDir = pathMod.dirname(pathMod.resolve(filePath));
          const detector = new HallucinationDetector();
          const result = detector.detect(content, language, projectDir);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ file: filePath, hallucinations: result }, null, 2),
            }],
          };
        }

        case 'mind_process': {
          const { ProjectMind } = await import('@aide/mind');
          const { ProviderRegistry } = await import('@aide/guard');
          const { loadConfig } = await import('@aide/core');
          const appConfig = loadConfig();
          // Register enabled providers
          const registry = new ProviderRegistry();
          for (const [provName, provConfig] of Object.entries(appConfig.providers)) {
            if (provConfig.enabled && provConfig.apiKey) {
              registry.registerProvider(provName, provConfig);
            }
          }
          const provider = registry.getProvider(appConfig.mind.defaultModel);
          if (!provider) {
            return {
              content: [{ type: 'text', text: `Provider "${appConfig.mind.defaultModel}" not available` }],
              isError: true,
            };
          }
          // Wrap as LLMAdapter interface
          const adapter = {
            chat: async (messages: import('@aide/core').ChatMessage[]) => {
              const resp = await provider.chatCompletion({
                model: appConfig.mind.defaultModel,
                messages,
              });
              return resp.choices[0]?.message?.content || '';
            },
          };
          const mindEngine = new ProjectMind(appConfig.mind, adapter);
          const result = await mindEngine.processIdea(
            (args as any).idea,
            (args as any).outputDir,
          );
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AIDE MCP server started on stdio');
}

export const MCP_VERSION = '1.0.0';
