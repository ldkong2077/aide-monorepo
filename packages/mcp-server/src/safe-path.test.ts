/**
 * Tests for the safe-path resolution utility.
 *
 * Coverage:
 *  - happy paths (relative + absolute paths)
 *  - path traversal attempts
 *  - symlink escape attempts
 *  - empty / non-string input
 *  - non-existent paths (mustExist: true vs false)
 *  - allow-list patterns
 *  - batch resolution
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { resolveSafePath, resolveSafePaths } from './safe-path.js';

let sandbox: string;
let outsideDir: string;
let symlinkPath: string;
let realFile: string;

beforeEach(async () => {
  // Create a sandbox project root.
  sandbox = await mkdtemp(join(tmpdir(), 'aide-safepath-'));
  // Create an "outside" directory that traversal attempts will target.
  outsideDir = await mkdtemp(join(tmpdir(), 'aide-outside-'));
  // Create a real file inside the sandbox.
  realFile = join(sandbox, 'real.txt');
  await writeFile(realFile, 'hello');
  // Create a real file outside the sandbox.
  const outsideFile = join(outsideDir, 'secret.txt');
  await writeFile(outsideFile, 'SECRET');
  // Create a symlink inside the sandbox that points outside.
  symlinkPath = join(sandbox, 'escape');
  await symlink(outsideFile, symlinkPath, 'file');
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
});

describe('resolveSafePath — happy paths', () => {
  it('resolves a relative path inside the project root', async () => {
    const result = await resolveSafePath('real.txt', { projectRoot: sandbox });
    expect(result).toBe(resolve(sandbox, 'real.txt'));
  });

  it('resolves an absolute path inside the project root', async () => {
    const result = await resolveSafePath(realFile, { projectRoot: sandbox });
    expect(result).toBe(realFile);
  });

  it('resolves a nested relative path', async () => {
    const nestedDir = join(sandbox, 'a', 'b', 'c');
    await mkdir(nestedDir, { recursive: true });
    const result = await resolveSafePath('a/b/c', { projectRoot: sandbox });
    expect(result).toBe(resolve(sandbox, 'a', 'b', 'c'));
  });

  it('resolves a non-existent path when mustExist is false', async () => {
    const result = await resolveSafePath('not-yet-created.txt', {
      projectRoot: sandbox,
      mustExist: false,
    });
    expect(result).toBe(resolve(sandbox, 'not-yet-created.txt'));
  });
});

describe('resolveSafePath — rejections', () => {
  it('rejects an empty string', async () => {
    await expect(resolveSafePath('', { projectRoot: sandbox })).rejects.toMatchObject({
      code: 'PATH_INVALID',
    });
  });

  it('rejects a whitespace-only string', async () => {
    await expect(resolveSafePath('   ', { projectRoot: sandbox })).rejects.toMatchObject({
      code: 'PATH_INVALID',
    });
  });

  it('rejects a non-string at runtime', async () => {
    // Bypass the type signature to verify the runtime guard.
    const badInput = null as unknown as string;
    await expect(resolveSafePath(badInput, { projectRoot: sandbox })).rejects.toMatchObject({
      code: 'PATH_INVALID',
    });
  });

  it('rejects a missing path when mustExist is true', async () => {
    await expect(
      resolveSafePath('does-not-exist.txt', { projectRoot: sandbox, mustExist: true }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_FOUND' });
  });

  it('blocks ../ traversal that escapes the root', async () => {
    const escape = join('..', '..', 'escape-target', 'file.txt');
    await expect(resolveSafePath(escape, { projectRoot: sandbox })).rejects.toMatchObject({
      code: 'PATH_TRAVERSAL',
    });
  });

  it('blocks an absolute path outside the root', async () => {
    await expect(
      resolveSafePath(join(outsideDir, 'secret.txt'), { projectRoot: sandbox }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });

  it('blocks symlink escape', async () => {
    // The sandbox contains a symlink that points OUTSIDE the sandbox.
    // resolveSafePath must canonicalize via realpath and reject.
    await expect(resolveSafePath('escape', { projectRoot: sandbox })).rejects.toMatchObject({
      code: 'PATH_TRAVERSAL',
    });
  });

  it('blocks Windows-style traversal when on Windows', async () => {
    if (sep !== '\\') return; // skip on POSIX
    await expect(
      resolveSafePath('..\\..\\Windows\\System32', { projectRoot: sandbox }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });
});

describe('resolveSafePath — allow patterns', () => {
  it('accepts a path matching the allow-list', async () => {
    const result = await resolveSafePath('real.txt', {
      projectRoot: sandbox,
      allowPatterns: ['*.txt', 'docs/**'],
    });
    expect(result).toBe(realFile);
  });

  it('rejects a path that matches nothing in the allow-list', async () => {
    const subDir = join(sandbox, 'config.json');
    await writeFile(subDir, '{}');
    await expect(
      resolveSafePath('config.json', {
        projectRoot: sandbox,
        allowPatterns: ['*.txt'],
      }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' });
  });
});

describe('resolveSafePaths — batch', () => {
  it('resolves multiple valid paths', async () => {
    const f2 = join(sandbox, 'second.txt');
    await writeFile(f2, 'world');
    const result = await resolveSafePaths(['real.txt', 'second.txt'], {
      projectRoot: sandbox,
    });
    expect(result).toEqual([realFile, f2]);
  });

  it('fails fast on the first bad path', async () => {
    await expect(
      resolveSafePaths(['real.txt', '../etc/passwd'], { projectRoot: sandbox }),
    ).rejects.toMatchObject({ code: 'PATH_TRAVERSAL' });
  });
});
