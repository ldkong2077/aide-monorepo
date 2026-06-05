// Quick MCP smoke test: starts the AIDE MCP server in a child
// process, sends `initialize` + `tools/list` + `prompts/list` +
// `resources/list`, prints responses, exits. Confirms the
// server speaks MCP correctly before pointing opencode at it.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const bin = resolve(repoRoot, 'packages', 'cli', 'dist', 'bin.js');

async function main() {
  const child = spawn(process.execPath, [bin, 'mcp', 'serve'], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf8');
  });

  const lines = [];
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim().length > 0) lines.push(line);
    }
  });

  function send(obj) {
    child.stdin.write(JSON.stringify(obj) + '\n');
  }

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'opencode-smoke', version: '1.15.13' },
    },
  });

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  send({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} });
  send({ jsonrpc: '2.0', id: 4, method: 'resources/list', params: {} });

  await new Promise((r) => setTimeout(r, 2000));
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));

  console.log('=== stderr ===');
  console.log(stderrBuf);
  console.log('=== stdout (JSON-RPC frames) ===');
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      console.log(JSON.stringify(obj, null, 2));
    } catch {
      console.log('[non-JSON]', line);
    }
  }
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});
