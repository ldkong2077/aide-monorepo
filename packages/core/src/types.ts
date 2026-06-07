/**
 * AIDE Core - Shared Type Definitions
 * Unified types used across all AIDE packages.
 */

// ==================== Task & Routing Types ====================

/** AI coding task types */
export enum TaskType {
  code_completion = "code_completion",
  code_generation = "code_generation",
  debugging = "debugging",
  refactoring = "refactoring",
  code_review = "code_review",
  explanation = "explanation",
  testing = "testing",
  general = "general",
}

/** Risk level for diff changes */
export type RiskLevel = "critical" | "high" | "medium" | "low";

/** Severity for reports */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** Verification verdict */
export type Verdict = "TRUST" | "REVIEW" | "REJECT";

/** Supported languages */
export type Language =
  | "python"
  | "typescript"
  | "javascript"
  | "go"
  | "java"
  | "rust"
  | "ruby"
  | "php"
  | "c"
  | "cpp"
  | "kotlin"
  | "swift"
  | "csharp"
  | "unknown";

/** Test framework types */
export type TestFramework =
  | "vitest"
  | "jest"
  | "pytest"
  | "go_test"
  | "unknown";

/** Route strategy */
export type RouteStrategy = "cost" | "quality" | "balanced";

// ==================== Provider Types ====================

/** Provider configuration */
export interface ProviderConfig {
  name?: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  pricing?: Record<string, { input: number; output: number }>;
  /**
   * Per-attempt wall-clock timeout in ms. Each retry attempt is
   * independently timed, so a 60s budget with 3 retries caps the
   * total wait at ~4 minutes worst case. Default: 60 000.
   */
  requestTimeoutMs?: number;
}

/** Model configuration */
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  quality_score: number;
  speed_score: number;
  max_context: number;
}

// ==================== Chat Types ====================

/** Chat message */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/** Tool call */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Chat completion request */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  n?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
  user?: string;
}

/** Chat completion response (OpenAI format) */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
  usage?: UsageInfo;
}

/** Response choice */
export interface Choice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

/** Token usage info */
export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ==================== Cost & Routing ====================

/** Cost record */
export interface CostRecord {
  timestamp: number;
  provider: string;
  model: string;
  task_type: TaskType;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/** Cost summary */
export interface CostSummary {
  period: string;
  total_usd: number;
  by_model: Record<string, number>;
  by_task: Record<string, number>;
  by_provider: Record<string, number>;
  request_count: number;
}

/** Route log entry */
export interface RouteLog {
  id: number;
  timestamp: number;
  task_type: TaskType;
  from_model: string;
  to_model: string;
  to_provider: string;
  latency_ms: number;
  success: boolean;
  cost_usd: number;
}

/** Model performance record */
export interface ModelPerformance {
  provider: string;
  model: string;
  task_type: TaskType;
  total_requests: number;
  success_count: number;
  avg_latency_ms: number;
  last_used: number;
}

/** Routing entry */
export interface RoutingEntry {
  model: string;
  provider: string;
  priority: number;
}

// ==================== CodeGuard Types ====================

/** Hallucination type */
export type HallucinationType = "package" | "api" | "identifier" | "logic";

/** Hallucination report */
export interface HallucinationReport {
  type?: HallucinationType;
  category?: "package_import" | "api_signature" | "ai_pattern" | "logic_issue";
  severity: Severity;
  message: string;
  line?: number;
  snippet?: string;
  suggestion?: string;
  location?: string;
  content?: string;
  evidence?: string;
}

/** Change type enum */
export enum ChangeType {
  SIGNATURE_CHANGE = "SIGNATURE_CHANGE",
  LOGIC_CHANGE = "LOGIC_CHANGE",
  API_CHANGE = "API_CHANGE",
  GUARD_REMOVED = "GUARD_REMOVED",
  NEW_FUNCTION = "NEW_FUNCTION",
  DELETED_FUNCTION = "DELETED_FUNCTION",
  REFACTOR = "REFACTOR",
  COSMETIC = "COSMETIC",
}

/** Single diff change */
export interface DiffChange {
  type: ChangeType;
  file: string;
  location: string;
  before: string;
  after: string;
  risk: RiskLevel;
  reason: string;
}

/** Diff analysis result */
export interface DiffResult {
  filePath: string;
  changes: DiffChange[];
  riskScore: number; // 0–1, where 1 = highest risk
  summary?: string;
}

/** Confidence score dimensions */
export interface ScoreDimensions {
  diffSafety: number;
  hallucinationFree: number;
  testPassRate: number;
  typeCheck: number;
}

/** Confidence score */
export interface ConfidenceScore {
  overall: number;
  verdict: Verdict;
  dimensions: ScoreDimensions;
  riskFactors: string[];
}

/** Test error */
export interface TestError {
  testName: string;
  message: string;
}

/** Test result */
export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  errors: TestError[];
  duration: number;
}

/** Verify options */
export interface VerifyOptions {
  path?: string;
  file?: string;
  diff?: { base: string; head: string };
  staged?: boolean;
  noTest?: boolean;
  format?: "console" | "json" | "markdown";
  minScore?: number;
}

/** Verification report */
export interface VerificationReport {
  id?: string;
  timestamp: number;
  options?: VerifyOptions;
  files_checked: string[];
  diffResults?: DiffResult[];
  hallucinations: HallucinationReport[];
  testResult?: TestResult | null;
  confidence: ConfidenceScore;
  summary: string;
}

// ==================== Server & Config Types ====================

/** CORS configuration.
 *
 * - `enabled: false`         → CORS plugin is not registered. Use this
 *   when the proxy sits behind a reverse proxy that already adds
 *   CORS headers, or when only server-to-server callers reach it.
 * - `enabled: true, origins` → CORS plugin is registered with the
 *   given allow-list. `origins` is forwarded verbatim to
 *   `@fastify/cors`; pass full origins (`https://app.example.com`)
 *   or `"*"` for a public read-only API. */
export interface CorsConfig {
  enabled: boolean;
  /** Allow-list of origins. Use full origins (`scheme://host[:port]`).
   *  Set to `['*']` to allow any origin (not recommended in
   *  production — it disables credentialed requests). */
  origins: string[];
  /** Optional list of allowed methods; default = GET, POST, OPTIONS. */
  methods?: string[];
  /** Optional list of allowed headers; default = common JSON headers
   *  + Authorization (the proxy requires Bearer auth on most routes). */
  allowedHeaders?: string[];
  /** Whether the Access-Control-Allow-Credentials header is set.
   *  Defaults to false. Cannot be true when origins is `['*']`. */
  credentials?: boolean;
}

/** Per-token rate-limit policy. When set, the proxy caps the request
 *  volume per Bearer token using a continuous token-bucket. */
export interface RateLimitConfig {
  /** Maximum tokens in a full bucket. Default: 60. */
  limit?: number;
  /** Time (ms) to fully refill an empty bucket. Default: 60 000 (1 min). */
  windowMs?: number;
}

/** Log line format. `json` is required for log aggregation
 *  (Loki / Splunk / ES); `pretty` is for local development. */
export type LogFormat = "json" | "pretty";

/** Server config */
export interface ServerConfig {
  port: number;
  dashboard_port: number;
  token?: string;
  bodyLimit?: number;
  /** CORS policy. Defaults to a localhost-only allow-list so the
   *  bundled AIDE dashboard works out of the box; production
   *  deployments MUST set this to their public origin. */
  cors?: CorsConfig;
  /** When set, the proxy enforces per-Bearer-token rate limits. */
  rateLimit?: RateLimitConfig;
  /** When `'json'`, the proxy logs one JSON object per line
   *  (the default pino behaviour). When `'pretty'`, it routes
   *  through `pino-pretty` for coloured, human-readable output.
   *  Defaults to `'pretty'` for dev, but the CLI also honours the
   *  `LOG_FORMAT=json` environment variable. */
  logFormat?: LogFormat;
  /**
   * Token budget. Optional — when omitted, the proxy does not
   * pre-flight the prompt token count or track per-tenant daily
   * token usage (the per-USD cost circuit still applies).
   */
  tokenBudget?: {
    /** Max prompt tokens per single request. 0 disables. */
    maxPromptTokensPerRequest?: number;
    /** Max tokens per tenant per day (prompt + completion). 0 disables. */
    maxTokensPerTenantPerDay?: number;
    /** Circuit-open window after a daily overflow, in ms. */
    circuitResetMs?: number;
  };
  /**
   * Redis configuration. When set, rate-limit, tenant-circuit, and
   * cache state are stored in Redis instead of process-local memory,
   * enabling multi-replica deployments behind a load balancer.
   */
  redis?: {
    /** Redis connection URL, e.g. `redis://localhost:6379`.
     *  Supports all ioredis connection formats including TLS
     *  (`rediss://`) and Unix sockets. */
    url: string;
    /**
     * Optional connection options passed directly to ioredis.
     * Useful for `enableReadyCheck`, `maxRetriesPerRequest`,
     * `enableOfflineQueue`, etc.
     */
    connectOptions?: Record<string, unknown>;
    /**
     * Cache backend: `'sqlite'` (default, persistent, single-replica)
     * or `'redis'` (shared, multi-replica). When `'redis'`, the
     * LLM response cache uses Redis TTL instead of SQLite.
     */
    cacheType?: "sqlite" | "redis";
    /**
     * Optional key prefix for all AIDE Redis keys. Default: `'aide:'`.
     * Change when sharing a Redis instance with other applications.
     */
    keyPrefix?: string;
  };
}

/** Cost config */
export interface CostConfig {
  budgetDaily: number;
  budget_monthly: number;
  alertThreshold: number;
}

/** Guard config */
export interface GuardConfig {
  enabled: boolean;
  hallucinationCheck: boolean;
  diffAnalysis: boolean;
  autoRejectThreshold: number;
  trusted_packages: string[];
}

/** Graph config */
export interface GraphConfig {
  enabled: boolean;
  languages: string[];
  watchMode: boolean;
}

/** Mind config */
export interface MindConfig {
  enabled: boolean;
  defaultModel: string;
}

/** Unified AIDE app configuration */
export interface AppConfig {
  server: ServerConfig;
  strategy: RouteStrategy;
  providers: Record<string, ProviderConfig>;
  routing: Record<string, RoutingEntry[]>;
  cost: CostConfig;
  guard: GuardConfig;
  graph: GraphConfig;
  mind: MindConfig;
}

// ==================== SSE Types ====================

/** SSE event */
export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

// ==================== Dashboard Types ====================

/** Overall statistics */
export interface OverallStats {
  total_cost_usd: number;
  total_requests: number;
  avg_savings_percent: number;
  active_models: number;
  guard_rejections: number;
}

/** Model status */
export interface ModelStatus {
  id: string;
  name: string;
  provider: string;
  healthy: boolean;
  avg_latency_ms: number;
  success_rate: number;
  last_checked: number;
}

// ==================== MCP Types ====================

/** MCP tool definition */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

/** MCP property schema */
export interface MCPPropertySchema {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

/** MCP tool result */
export interface MCPToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// ==================== Installer Types ====================

/** Installer target ID */
export type InstallerTargetId =
  | "claude"
  | "cursor"
  | "codex"
  | "opencode"
  | "hermes";

/** Install location */
export type InstallLocation = "global" | "local";

/** Target detection result */
export interface TargetDetectionResult {
  installed: boolean;
  alreadyConfigured: boolean;
  configPath?: string;
}

/** Target write result */
export interface TargetWriteResult {
  files: {
    path: string;
    action: "created" | "updated" | "unchanged" | "removed" | "not-found";
  }[];
  notes?: string[];
}

/** Install options */
export interface TargetInstallOptions {
  autoAllow: boolean;
}

/** Installer target interface */
export interface InstallerTarget {
  readonly id: InstallerTargetId;
  readonly displayName: string;
  supportsLocation(loc: InstallLocation): boolean;
  detect(loc: InstallLocation): TargetDetectionResult;
  install(loc: InstallLocation, opts: TargetInstallOptions): TargetWriteResult;
  uninstall(loc: InstallLocation): TargetWriteResult;
  printConfig(loc: InstallLocation): string;
  describePaths(loc: InstallLocation): string[];
}

// ==================== Metrics Types ====================

/** Metric entry */
export interface MetricEntry {
  timestamp: number;
  command: string;
  duration_ms: number;
  memory_peak_mb: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}
