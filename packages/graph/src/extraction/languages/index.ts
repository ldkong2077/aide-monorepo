/**
 * Per-language extraction configurations.
 *
 * Each file exports a LanguageExtractor config object.
 * This barrel builds the EXTRACTORS map consumed by TreeSitterExtractor.
 */

import { type Language } from '../../types.js';
import type { LanguageExtractor } from '../tree-sitter-types.js';

import { typescriptExtractor } from './typescript.js';
import { javascriptExtractor } from './javascript.js';
import { pythonExtractor } from './python.js';
import { goExtractor } from './go.js';
import { rustExtractor } from './rust.js';
import { javaExtractor } from './java.js';
import { cExtractor, cppExtractor } from './c-cpp.js';
import { csharpExtractor } from './csharp.js';
import { phpExtractor } from './php.js';
import { rubyExtractor } from './ruby.js';
import { swiftExtractor } from './swift.js';
import { kotlinExtractor } from './kotlin.js';
import { dartExtractor } from './dart.js';
import { pascalExtractor } from './pascal.js';
import { scalaExtractor } from './scala.js';
import { luaExtractor } from './lua.js';
import { luauExtractor } from './luau.js';

export const EXTRACTORS: Partial<Record<Language, LanguageExtractor>> = {
  typescript: typescriptExtractor,
  tsx: typescriptExtractor,
  javascript: javascriptExtractor,
  jsx: javascriptExtractor,
  python: pythonExtractor,
  go: goExtractor,
  rust: rustExtractor,
  java: javaExtractor,
  c: cExtractor,
  cpp: cppExtractor,
  csharp: csharpExtractor,
  php: phpExtractor,
  ruby: rubyExtractor,
  swift: swiftExtractor,
  kotlin: kotlinExtractor,
  dart: dartExtractor,
  pascal: pascalExtractor,
  scala: scalaExtractor,
  lua: luaExtractor,
  luau: luauExtractor,
};
