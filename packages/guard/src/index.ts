// @aide-dev/guard - Verification pipeline for AI-generated code
export { Verifier } from "./guard/verifier.js";
export { HallucinationDetector } from "./guard/hallucination.js";
export { ASTDiffAnalyzer } from "./guard/ast-diff.js";
export { ConfidenceScorer } from "./guard/confidence.js";
export { TestRunner } from "./guard/test-runner.js";
export {
  ReportFormatter,
  formatConsoleReport,
  formatJSONReport,
  formatMarkdownReport,
} from "./guard/report.js";
export { createProxyServer } from "./proxy/index.js";
export { installGracefulShutdown } from "./proxy/shutdown.js";
export { readiness } from "./proxy/readiness.js";
export {
  TokenBucketRateLimiter,
  DEFAULT_RATE_LIMIT,
} from "./proxy/rate-limit.js";
export type { RateLimitConfig, RateLimitResult } from "./proxy/rate-limit.js";
export {
  createMetrics,
  bucketStatusCode,
  METRIC_HTTP_REQUESTS_TOTAL,
  METRIC_HTTP_REQUEST_DURATION_SECONDS,
  METRIC_HTTP_REQUESTS_IN_FLIGHT,
  METRIC_UPSTREAM_REQUESTS_TOTAL,
  METRIC_UPSTREAM_REQUEST_DURATION_SECONDS,
  METRIC_RATE_LIMIT_REJECTIONS_TOTAL,
  METRIC_AUTH_FAILURES_TOTAL,
  METRIC_READY_STATE,
} from "./proxy/metrics.js";
export type { MetricsBundle, StatusBucket } from "./proxy/metrics.js";
export { SQLiteStorage, createStorage } from "./storage/index.js";
export {
  OpenAICompatibleProvider,
  AnthropicProvider,
  ProviderRegistry,
} from "./provider/index.js";
export { RouteEngine } from "./router/index.js";
// LLM response cache — content-addressed, persistent, with TTL + LRU
// eviction. Wired into the proxy in `createProxyServer` when supplied
// via the `cache` option.
export {
  LLMCache,
  computeRequestHash,
  withCache,
  createCache,
  newCacheTraceId,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TRACK_HITS,
} from "./cache/index.js";
export type {
  LLMCacheConfig,
  LLMCacheStats,
  LLMCacheHit,
} from "./cache/index.js";
export * from "./types.js";
export const GUARD_VERSION = "1.0.0";
