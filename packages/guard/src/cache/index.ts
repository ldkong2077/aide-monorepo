/**
 * @aide/guard — LLM response cache.
 *
 * Public surface of the cache module. Re-exports the constructor,
 * the request-hash helper, the withCache decorator, and the public
 * types so consumers can import everything from
 * `import { ... } from '@aide/guard'`.
 */
export {
  LLMCache,
  computeRequestHash,
  withCache,
  createCache,
  newCacheTraceId,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TRACK_HITS,
} from './llm-cache.js';
export type {
  LLMCacheConfig,
  LLMCacheStats,
  LLMCacheHit,
} from './llm-cache.js';
