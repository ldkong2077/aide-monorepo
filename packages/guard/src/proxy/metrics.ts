/**
 * AIDE guard proxy — Prometheus metrics.
 *
 * Exposes one private `prom-client` `Registry` per `createMetrics()`
 * call so tests can spin up isolated instances. We deliberately do
 * NOT use the global `prom-client` default registry — that would
 * leak state between unit tests.
 *
 * Metrics exposed (all names prefixed `aide_`):
 *   - `aide_http_requests_total`              counter   method, route, status_code
 *   - `aide_http_request_duration_seconds`   histogram method, route
 *   - `aide_http_requests_in_flight`         gauge
 *   - `aide_upstream_requests_total`         counter   provider, model, outcome
 *   - `aide_upstream_request_duration_seconds` histogram provider, model
 *   - `aide_rate_limit_rejections_total`     counter
 *   - `aide_auth_failures_total`             counter
 *   - `aide_tenant_circuit_rejections_total` counter   tenant
 *   - `aide_tenant_daily_cost_usd`           gauge     tenant
 *   - `aide_ready_state`                     gauge     0|1
 *   - plus the standard `prom-client` default node/process metrics
 *
 * The route label is the Fastify route pattern (e.g. `/v1/chat/completions`),
 * NOT the literal request URL — this keeps cardinality bounded.
 */
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const METRIC_HTTP_REQUESTS_TOTAL = "aide_http_requests_total";
export const METRIC_HTTP_REQUEST_DURATION_SECONDS =
  "aide_http_request_duration_seconds";
export const METRIC_HTTP_REQUESTS_IN_FLIGHT = "aide_http_requests_in_flight";
export const METRIC_UPSTREAM_REQUESTS_TOTAL = "aide_upstream_requests_total";
export const METRIC_UPSTREAM_REQUEST_DURATION_SECONDS =
  "aide_upstream_request_duration_seconds";
export const METRIC_RATE_LIMIT_REJECTIONS_TOTAL =
  "aide_rate_limit_rejections_total";
export const METRIC_AUTH_FAILURES_TOTAL = "aide_auth_failures_total";
export const METRIC_TENANT_CIRCUIT_REJECTIONS_TOTAL =
  "aide_tenant_circuit_rejections_total";
export const METRIC_TENANT_DAILY_COST_USD = "aide_tenant_daily_cost_usd";
export const METRIC_READY_STATE = "aide_ready_state";
export const METRIC_CACHE_HITS_TOTAL = "aide_cache_hits_total";
export const METRIC_CACHE_MISSES_TOTAL = "aide_cache_misses_total";
export const METRIC_CACHE_EVICTIONS_TOTAL = "aide_cache_evictions_total";
export const METRIC_TOKENS_PROCESSED_TOTAL = "aide_tokens_processed_total";
export const METRIC_TOKEN_BUDGET_REJECTIONS_TOTAL =
  "aide_token_budget_rejections_total";
export const METRIC_TENANT_DAILY_TOKENS = "aide_tenant_daily_tokens";

/** Bucketed status code labels to keep label cardinality bounded. */
export type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "xxx";

/** Map a raw HTTP status code to one of five buckets. */
export function bucketStatusCode(code: number | undefined): StatusBucket {
  if (code === undefined || code === 0) return "xxx";
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500 && code < 600) return "5xx";
  return "xxx";
}

export interface MetricsBundle {
  readonly register: Registry;
  readonly httpRequests: Counter<"method" | "route" | "status_code">;
  readonly httpDuration: Histogram<"method" | "route">;
  readonly httpInFlight: Gauge<"route">;
  readonly upstreamRequests: Counter<"provider" | "model" | "outcome">;
  readonly upstreamDuration: Histogram<"provider" | "model">;
  readonly rateLimitRejections: Counter<string>;
  readonly authFailures: Counter<string>;
  readonly tenantCircuitRejections: Counter<"tenant">;
  readonly tenantDailyCost: Gauge<"tenant">;
  readonly readyState: Gauge<string>;
  readonly cacheHits: Counter<"model">;
  readonly cacheMisses: Counter<"model">;
  readonly cacheEvictions: Counter<string>;
  readonly tokensProcessed: Counter<"tenant" | "model" | "direction">;
  readonly tokenBudgetRejections: Counter<"tenant" | "reason">;
  readonly tenantDailyTokens: Gauge<"tenant">;
  /**
   * Snapshot the registry as Prometheus text. Wraps
   * `Registry.metrics()` for ergonomic typing.
   */
  toText(): Promise<string>;
}

/**
 * Create an isolated metrics bundle. Each call returns a fresh
 * `Registry`, so two proxies in the same process do not share
 * counter state — useful for tests and side-by-side comparisons.
 */
export function createMetrics(): MetricsBundle {
  const register = new Registry();

  // Default Node.js process metrics (CPU, RSS, event-loop lag, GC, …).
  collectDefaultMetrics({ register });

  const httpRequests = new Counter({
    name: METRIC_HTTP_REQUESTS_TOTAL,
    help: "Total HTTP requests handled by the proxy, bucketed by status class.",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [register],
  });

  const httpDuration = new Histogram({
    name: METRIC_HTTP_REQUEST_DURATION_SECONDS,
    help: "HTTP request duration in seconds, by method and route pattern.",
    labelNames: ["method", "route"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });

  const httpInFlight = new Gauge({
    name: METRIC_HTTP_REQUESTS_IN_FLIGHT,
    help: "Number of HTTP requests currently being handled.",
    registers: [register],
  });

  const upstreamRequests = new Counter({
    name: METRIC_UPSTREAM_REQUESTS_TOTAL,
    help: "Total upstream LLM provider calls, by provider, model, and outcome.",
    labelNames: ["provider", "model", "outcome"] as const,
    registers: [register],
  });

  const upstreamDuration = new Histogram({
    name: METRIC_UPSTREAM_REQUEST_DURATION_SECONDS,
    help: "Upstream LLM provider call duration in seconds (full request, including retries).",
    labelNames: ["provider", "model"] as const,
    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [register],
  });

  const rateLimitRejections = new Counter({
    name: METRIC_RATE_LIMIT_REJECTIONS_TOTAL,
    help: "Total requests rejected by the per-Bearer-token rate limiter.",
    registers: [register],
  });

  const authFailures = new Counter({
    name: METRIC_AUTH_FAILURES_TOTAL,
    help: "Total requests that failed Bearer-token authentication.",
    registers: [register],
  });

  const tenantCircuitRejections = new Counter({
    name: METRIC_TENANT_CIRCUIT_REJECTIONS_TOTAL,
    help: "Total requests rejected because the tenant cost circuit was open.",
    labelNames: ["tenant"] as const,
    registers: [register],
  });

  const tenantDailyCost = new Gauge({
    name: METRIC_TENANT_DAILY_COST_USD,
    help: "Per-tenant daily spend in USD (resets at UTC midnight).",
    labelNames: ["tenant"] as const,
    registers: [register],
  });

  const readyState = new Gauge({
    name: METRIC_READY_STATE,
    help: "1 when /readyz would return 200, 0 otherwise (starting or shutting down).",
    registers: [register],
  });

  const cacheHits = new Counter({
    name: METRIC_CACHE_HITS_TOTAL,
    help: "LLM response cache hits, by the routed model.",
    labelNames: ["model"] as const,
    registers: [register],
  });

  const cacheMisses = new Counter({
    name: METRIC_CACHE_MISSES_TOTAL,
    help: "LLM response cache misses, by the routed model.",
    labelNames: ["model"] as const,
    registers: [register],
  });

  const cacheEvictions = new Counter({
    name: METRIC_CACHE_EVICTIONS_TOTAL,
    help: "LLM response cache evictions (TTL expiry or LRU cap).",
    registers: [register],
  });

  const tokensProcessed = new Counter({
    name: METRIC_TOKENS_PROCESSED_TOTAL,
    help: "Total tokens processed by the proxy, by tenant, model, and direction (prompt|completion).",
    labelNames: ["tenant", "model", "direction"] as const,
    registers: [register],
  });

  const tokenBudgetRejections = new Counter({
    name: METRIC_TOKEN_BUDGET_REJECTIONS_TOTAL,
    help: "Requests rejected by the token budget enforcer, by tenant and reason (per_request|per_tenant_daily).",
    labelNames: ["tenant", "reason"] as const,
    registers: [register],
  });

  const tenantDailyTokens = new Gauge({
    name: METRIC_TENANT_DAILY_TOKENS,
    help: "Per-tenant daily token usage (prompt + completion), resets at UTC midnight.",
    labelNames: ["tenant"] as const,
    registers: [register],
  });

  return {
    register,
    httpRequests,
    httpDuration,
    httpInFlight,
    upstreamRequests,
    upstreamDuration,
    rateLimitRejections,
    authFailures,
    tenantCircuitRejections,
    tenantDailyCost,
    readyState,
    cacheHits,
    cacheMisses,
    cacheEvictions,
    tokensProcessed,
    tokenBudgetRejections,
    tenantDailyTokens,
    toText: () => register.metrics(),
  };
}
