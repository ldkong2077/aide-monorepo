export {
  AideError,
  ConfigError,
  GuardError,
  RouteError,
  GraphError,
  MindError,
  type ErrorSeverity,
} from "./errors.js";

export {
  resolveSafePath,
  resolveSafePaths,
  validatePathWithinRoot,
  validateProjectPath,
  isPathWithinRoot,
  isPathWithinRootReal,
  type SafePathOptions,
} from "./path.js";

export {
  createLogger,
  silentLogger,
  type Logger,
  type LoggerOptions,
} from "./logger.js";

export {
  CONFIG_FILENAME,
  getDefaultConfig,
  findConfigPath,
  loadConfig,
  generateDefaultConfigFile,
} from "./config.js";

export {
  openDatabase,
  getSchemaVersion,
  DatabaseError,
  type DbOptions,
} from "./db/index.js";

export {
  countTokens,
  countMessageTokens,
  estimateRequestTokens,
  isWithinTokenLimit,
  encodingForModel,
  DEFAULT_ENCODING,
  type TokenizerEncoding,
} from "./tokenizer.js";

// Enums (must be exported as values, not types)
export { TaskType, ChangeType } from "./types.js";

export type {
  // Base types
  RiskLevel,
  Severity,
  Verdict,
  Language,
  TestFramework,
  RouteStrategy,
  HallucinationType,
  // Interfaces
  ProviderConfig,
  ModelConfig,
  ChatMessage,
  ToolCall,
  ChatCompletionRequest,
  ChatCompletionResponse,
  Choice,
  UsageInfo,
  CostRecord,
  CostSummary,
  RouteLog,
  ModelPerformance,
  RoutingEntry,
  HallucinationReport,
  DiffChange,
  DiffResult,
  ScoreDimensions,
  ConfidenceScore,
  TestError,
  TestResult,
  VerifyOptions,
  VerificationReport,
  RateLimitConfig,
  LogFormat,
  CorsConfig,
  ServerConfig,
  CostConfig,
  GuardConfig,
  GraphConfig,
  MindConfig,
  AppConfig,
  SSEEvent,
  OverallStats,
  ModelStatus,
  MCPToolDefinition,
  MCPPropertySchema,
  MCPToolResult,
  InstallerTargetId,
  InstallLocation,
  TargetDetectionResult,
  TargetWriteResult,
  TargetInstallOptions,
  InstallerTarget,
  MetricEntry,
} from "./types.js";
