/**
 * Verify-target resolution for `aide guard verify`.
 *
 * The CLI exposes several input modes (single file, file list, glob, dir,
 * staged git changes, git diff). This module is the single source of truth
 * for two things:
 *   1. mutual-exclusion validation
 *   2. glob → file-list expansion
 *
 * Pulled out of `bin.ts` so it can be unit-tested in isolation.
 */
import { glob } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

export interface VerifyOpts {
  file?: string;
  files?: string;
  pattern?: string;
  path?: string;
  staged?: boolean;
  base?: string;
  head?: string;
}

export type VerifyTarget =
  | { kind: 'file'; file: string }
  | { kind: 'files'; files: string[] }
  | { kind: 'path'; path: string }
  | { kind: 'staged' }
  | { kind: 'diff'; base: string; head: string };

export const VERIFY_MODE_KEYS = ['file', 'files', 'pattern', 'path', 'staged', 'base'] as const;
export type VerifyModeKey = (typeof VERIFY_MODE_KEYS)[number];

/** Count which verify modes are active in the parsed options. */
export function countEnabledModes(
  opts: VerifyOpts,
  baseOverride?: string,
  headOverride?: string,
): Set<VerifyModeKey> {
  const enabled = new Set<VerifyModeKey>();
  if (opts.file !== undefined) enabled.add('file');
  if (opts.files !== undefined) enabled.add('files');
  if (opts.pattern !== undefined) enabled.add('pattern');
  if (opts.path !== undefined) enabled.add('path');
  if (opts.staged) enabled.add('staged');
  if (baseOverride !== undefined || headOverride !== undefined) enabled.add('base');
  return enabled;
}

function assertIsFile(p: string, flag: string): void {
  if (!existsSync(p) || !statSync(p).isFile()) {
    throw new Error(`${flag} does not point to a file: ${p}`);
  }
}

function assertIsDir(p: string, flag: string): void {
  if (!existsSync(p) || !statSync(p).isDirectory()) {
    throw new Error(`${flag} does not point to a directory: ${p}`);
  }
}

/**
 * Resolve raw CLI options into a concrete VerifyTarget. Throws on
 * mutual-exclusion violations or on filesystem-shape mismatches.
 */
export async function resolveVerifyTarget(
  opts: VerifyOpts,
  baseOverride?: string,
  headOverride?: string,
): Promise<VerifyTarget> {
  const enabled = countEnabledModes(opts, baseOverride, headOverride);
  if (enabled.size > 1) {
    throw new Error(
      `Conflicting verify targets: ${[...enabled].join(', ')}. ` +
        'Use only one of --file, --files, --pattern, --path, --staged, --base/--head.',
    );
  }

  if (opts.file !== undefined) {
    if (opts.file === '') throw new Error('--file must be a non-empty path');
    assertIsFile(opts.file, '--file');
    return { kind: 'file', file: pathResolve(opts.file) };
  }

  if (opts.files !== undefined) {
    const list = opts.files
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) throw new Error('--files must contain at least one path');
    for (const f of list) assertIsFile(f, '--files');
    return { kind: 'files', files: list.map((f) => pathResolve(f)) };
  }

  if (opts.pattern !== undefined) {
    if (opts.pattern === '') throw new Error('--pattern must be a non-empty glob');
    const cwd = process.cwd();
    const matches: string[] = [];
    for await (const entry of glob(opts.pattern, { cwd })) {
      matches.push(pathResolve(cwd, entry));
    }
    if (matches.length === 0) {
      throw new Error(`--pattern matched no files: ${opts.pattern}`);
    }
    return { kind: 'files', files: matches };
  }

  if (opts.path !== undefined) {
    if (opts.path === '') throw new Error('--path must be a non-empty directory');
    assertIsDir(opts.path, '--path');
    return { kind: 'path', path: pathResolve(opts.path) };
  }

  if (opts.staged) {
    return { kind: 'staged' };
  }

  if (baseOverride || headOverride) {
    return {
      kind: 'diff',
      base: baseOverride ?? 'HEAD~1',
      head: headOverride ?? 'HEAD',
    };
  }

  // Default: verify the current directory.
  return { kind: 'path', path: process.cwd() };
}
