#!/usr/bin/env node
/**
 * Copy non-TS assets (SQL schemas, worker .js files, vendored WASM grammars)
 * from src/ to dist/ so the compiled ESM modules can load them at runtime.
 *
 * TypeScript only handles .ts → .js; everything else has to be copied
 * explicitly. Centralising it here means new assets only need to be added
 * in one place (the ASSETS list below).
 */
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const SRC = join(PKG_ROOT, 'src');
const DIST = join(PKG_ROOT, 'dist');

/**
 * Files / directories to copy relative to src/. Glob patterns use simple
 * suffix matching (no minimatch) to keep the postbuild script dependency-free.
 */
const ASSETS = [
  'db/schema.sql',
  'extraction/wasm',
  'extraction/parse-worker.js',
  'installer/locales',
];

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function copyRecursive(srcPath, destPath) {
  const stat = statSync(srcPath);
  if (stat.isDirectory()) {
    ensureDir(destPath);
    for (const entry of readdirSync(srcPath)) {
      copyRecursive(join(srcPath, entry), join(destPath, entry));
    }
  } else {
    ensureDir(dirname(destPath));
    copyFileSync(srcPath, destPath);
    console.log(`  copy ${relative(PKG_ROOT, srcPath)} → ${relative(PKG_ROOT, destPath)}`);
  }
}

let copied = 0;
for (const rel of ASSETS) {
  const srcPath = join(SRC, rel);
  const destPath = join(DIST, rel);
  if (!existsSync(srcPath)) {
    console.warn(`  skip (not found): ${rel}`);
    continue;
  }
  copyRecursive(srcPath, destPath);
  copied++;
}

console.log(`postbuild: copied ${copied} asset group(s)`);
