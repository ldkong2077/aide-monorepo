/**
 * CodeShield - 共享类型定义
 * 包含 RouteCode（智能路由）和 CodeGuard（代码验证）的所有类型
 */

// ==================== 任务类型 ====================

/** AI编码任务类型枚举 */
export enum TaskType {
  code_completion = 'code_completion',
  code_generation = 'code_generation',
  debugging = 'debugging',
  refactoring = 'refactoring',
  code_review = 'code_review',
  explanation = 'explanation',
  testing = 'testing',
  general = 'general',
}

/** 风险等级 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

/** 严重程度 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 判定结果 */
export type Verdict = 'TRUST' | 'REVIEW' | 'REJECT';

/** 语言类型 */
export type Language = 'python' | 'typescript' | 'javascript' | 'go' | 'unknown';

/** 测试框架类型 */
export type TestFramework = 'vitest' | 'jest' | 'pytest' | 'go_test' | 'unknown';

// ==================== Provider 相关 ====================

/** Provider 配置 */
export interface ProviderConfig {
  name?: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  pricing?: Record<string, { input: number; output: number }>; // 自定义模型定价: modelId -> {input: $/1k tokens, output: $/1k tokens}
  /**
   * Per-attempt wall-clock timeout in ms. Each retry attempt is
   * independently timed, so a 60s budget with 3 retries caps the
   * total wait at ~4 minutes worst case. Default: 60 000.
   */
  requestTimeoutMs?: number;
}

/** 模型配置 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  quality_score: number; // 0-10
  speed_score: number; // 0-10
  max_context: number; // 最大上下文token数
}

// ==================== 路由策略 ====================

/** 路由策略 */
export type RouteStrategy = 'cost' | 'quality' | 'balanced';

// ==================== Chat 相关 ====================

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Chat Completion 请求 */
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

/** Chat Completion 响应（OpenAI格式） */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Choice[];
  usage?: UsageInfo;
}

/** 响应选项 */
export interface Choice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

/** Token使用信息 */
export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// ==================== 成本追踪 ====================

/** 成本记录 */
export interface CostRecord {
  timestamp: number;
  provider: string;
  model: string;
  task_type: TaskType;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

// ==================== CodeGuard - 幻觉检测 ====================

/** 幻觉类型 */
export type HallucinationType = 'package' | 'api' | 'identifier' | 'logic';

/** 幻觉报告 */
export interface HallucinationReport {
  type?: HallucinationType;
  category?: 'package_import' | 'api_signature' | 'ai_pattern' | 'logic_issue';
  severity: Severity;
  message: string;
  line?: number;
  snippet?: string;
  suggestion?: string;
  location?: string;
  content?: string;
  evidence?: string;
}

// ==================== CodeGuard - Diff 分析 ====================

/** 变更类型 */
export enum ChangeType {
  SIGNATURE_CHANGE = 'SIGNATURE_CHANGE',
  LOGIC_CHANGE = 'LOGIC_CHANGE',
  API_CHANGE = 'API_CHANGE',
  GUARD_REMOVED = 'GUARD_REMOVED',
  NEW_FUNCTION = 'NEW_FUNCTION',
  DELETED_FUNCTION = 'DELETED_FUNCTION',
  REFACTOR = 'REFACTOR',
  COSMETIC = 'COSMETIC',
}

/** 单个Diff变更 */
export interface DiffChange {
  type: ChangeType;
  file: string;
  location: string;
  before: string;
  after: string;
  risk: RiskLevel;
  reason: string;
}

/** Diff分析结果 */
export interface DiffResult {
  filePath: string;
  changes: DiffChange[];
  riskScore: number; // 0-100
  summary?: string;
}

// ==================== CodeGuard - 置信度 ====================

/** 置信度评分维度 */
export interface ScoreDimensions {
  diffSafety: number;
  hallucinationFree: number;
  testPassRate: number;
  typeCheck: number;
}

/** 置信度评分 */
export interface ConfidenceScore {
  overall: number; // 0-100
  verdict: Verdict;
  dimensions: ScoreDimensions;
  riskFactors: string[]; // 风险因素列表
}

// ==================== CodeGuard - 测试 ====================

/** 测试错误 */
export interface TestError {
  testName: string;
  message: string;
}

/** 测试结果 */
export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  errors: TestError[];
  duration: number;
}

// ==================== CodeGuard - 验证报告 ====================

/** 验证选项 */
export interface VerifyOptions {
  path?: string;
  file?: string;
  diff?: { base: string; head: string };
  staged?: boolean;
  noTest?: boolean;
  format?: 'console' | 'json' | 'markdown';
  minScore?: number;
}

/** 验证报告 */
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

// ==================== 应用配置 ====================

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
export type LogFormat = 'json' | 'pretty';

/** 服务器配置 */
export interface ServerConfig {
  port: number;
  dashboard_port: number;
  token?: string; // Bearer Token 认证密钥
  bodyLimit?: number; // 请求体大小限制（字节），默认 1MB
  /** When set, the proxy enforces per-Bearer-token rate limits. */
  rateLimit?: RateLimitConfig;
  /** When `'json'`, the proxy logs one JSON object per line
   *  (the default pino behaviour). When `'pretty'`, it routes
   *  through `pino-pretty` for coloured, human-readable output.
   *  Defaults to `'pretty'` for dev, but the CLI also honours the
   *  `LOG_FORMAT=json` environment variable. */
  logFormat?: LogFormat;
  /** CORS policy. When omitted, no CORS plugin is registered and
   *  the proxy only answers same-origin requests. */
  cors?: CorsConfig;
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
    cacheType?: 'sqlite' | 'redis';
    /**
     * Optional key prefix for all AIDE Redis keys. Default: `'aide:'`.
     * Change when sharing a Redis instance with other applications.
     */
    keyPrefix?: string;
  };
}

/** CORS configuration for the proxy.
 *
 *  - `enabled: false`         → CORS plugin is not registered. Use
 *    this when the proxy sits behind a reverse proxy that already
 *    adds CORS headers, or when only server-to-server callers
 *    reach it.
 *  - `enabled: true, origins`  → CORS plugin is registered with
 *    the given allow-list. `origins` is forwarded verbatim to
 *    `@fastify/cors`; pass full origins (`https://app.example.com`)
 *    or `['*']` for a public read-only API. */
export interface CorsConfig {
  enabled: boolean;
  /** Allow-list of origins. Use full origins
   *  (`scheme://host[:port]`). Set to `['*']` to allow any origin
   *  (disables credentialed requests). */
  origins: string[];
  /** Optional list of allowed methods; default
   *  = `['GET', 'POST', 'OPTIONS']`. */
  methods?: string[];
  /** Optional list of allowed headers; default
   *  = `['Content-Type', 'Authorization', 'X-Request-Id']`. */
  allowedHeaders?: string[];
  /** Whether the `Access-Control-Allow-Credentials` header is set.
   *  Defaults to `false`. Cannot be `true` when `origins` is
   *  `['*']`. */
  credentials?: boolean;
}

/** 成本配置 */
export interface CostConfig {
  budgetDaily: number;
  budget_monthly: number;
  alertThreshold: number; // 0-1, 触发告警的预算使用比例
}

/** Guard配置 */
export interface GuardConfig {
  enabled: boolean;
  hallucinationCheck: boolean;
  diffAnalysis: boolean;
  autoRejectThreshold: number; // 置信度低于此值自动拒绝
  trusted_packages: string[];
}

/** 应用总配置 */
export interface AppConfig {
  server: ServerConfig;
  strategy: RouteStrategy;
  providers: Record<string, ProviderConfig>;
  routing: Record<string, RoutingEntry[]>;
  cost: CostConfig;
  guard: GuardConfig;
}

/** 路由条目 */
export interface RoutingEntry {
  model: string;
  provider: string;
  priority: number;
}

// ==================== 模型性能 ====================

/** 模型性能记录 */
export interface ModelPerformance {
  provider: string;
  model: string;
  task_type: TaskType;
  total_requests: number;
  success_count: number;
  avg_latency_ms: number;
  last_used: number;
}

// ==================== 路由日志 ====================

/** 路由日志 */
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

// ==================== SSE 流事件 ====================

/** SSE流事件 */
export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

// ==================== Dashboard 统计 ====================

/** 总体统计 */
export interface OverallStats {
  total_cost_usd: number;
  total_requests: number;
  avg_savings_percent: number;
  active_models: number;
  guard_rejections: number;
}

/** 成本汇总 */
export interface CostSummary {
  period: string;
  total_usd: number;
  by_model: Record<string, number>;
  by_task: Record<string, number>;
  by_provider: Record<string, number>;
  request_count: number;
}

/** 模型状态 */
export interface ModelStatus {
  id: string;
  name: string;
  provider: string;
  healthy: boolean;
  avg_latency_ms: number;
  success_rate: number;
  last_checked: number;
}

// ==================== 文件监视 ====================

/** 文件变更事件 */
export interface FileChangeEvent {
  filePath: string;
  event: 'add' | 'change' | 'unlink' | 'rename';
}

/** 监视选项 */
export interface WatchOptions {
  debounceMs?: number;
  extensions?: string[];
  excludeDirs?: string[];
  noTest?: boolean;
  format?: 'console' | 'json' | 'markdown';
}

// ==================== MCP 相关类型 ====================

/** MCP工具定义 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

/** MCP属性Schema */
export interface MCPPropertySchema {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

/** MCP工具执行结果 */
export interface MCPToolResult {
  content: {
    type: 'text';
    text: string;
  }[];
  isError?: boolean;
}

// ==================== Installer 相关类型 ====================

/** 安装目标ID */
export type InstallerTargetId = 'claude' | 'cursor' | 'codex' | 'vscode' | 'windsurf';

/** 安装位置 */
export type InstallLocation = 'global' | 'local';

/** 检测结果 */
export interface TargetDetectionResult {
  installed: boolean;
  alreadyConfigured: boolean;
  configPath?: string;
}

/** 写入结果 */
export interface TargetWriteResult {
  files: {
    path: string;
    action: 'created' | 'updated' | 'unchanged' | 'removed' | 'not-found';
  }[];
  notes?: string[];
}

/** 安装选项 */
export interface TargetInstallOptions {
  autoAllow: boolean;
}

/** 安装目标接口 */
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

// ==================== Profile 相关类型 ====================

/** 配置 Profile */
export interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  config: AppConfig;
}

/** Profile 列表摘要 */
export interface ProfileSummary {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  updatedAt: number;
}
