// @aide/core - Shared infrastructure for all aide packages.

export {
  AideError,
  ConfigError,
  GuardError,
  RouteError,
  GraphError,
  MindError,
  type ErrorSeverity,
} from './errors.js';

export { createLogger, silentLogger, type Logger, type LoggerOptions } from './logger.js';

export {
  CONFIG_FILENAME,
  getDefaultConfig,
  findConfigPath,
  loadConfig,
  generateDefaultConfigFile,
} from './config.js';

export { openDatabase, getSchemaVersion, DatabaseError, type DbOptions } from './db/index.js';

export {
  countTokens,
  countMessageTokens,
  estimateRequestTokens,
  isWithinTokenLimit,
  encodingForModel,
  DEFAULT_ENCODING,
  type TokenizerEncoding,
} from './tokenizer.js';

export type {
  // Enums and base types
  TaskType,
  RiskLevel,
  Severity,
  Verdict,
  Language,
  TestFramework,
  RouteStrategy,
  HallucinationType,
  ChangeType,
  // Interfaces
  ProviderConfig,
  ModelConfig,
  ChatMessage,
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
} from './types.js';
