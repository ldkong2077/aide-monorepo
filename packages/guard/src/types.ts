/**
 * @aide-dev/guard - Shared Type Definitions
 *
 * Re-exports all types from @aide-dev/core and adds guard-specific types
 * (proxy server config, rate limiting, profiles, etc.) that are not
 * part of the core package.
 */

// ==================== Re-export from @aide-dev/core ====================

// Enums (must be exported as values, not types)
export { TaskType, ChangeType } from "@aide-dev/core";

export type {
  // Task & Routing
  RiskLevel,
  Severity,
  Verdict,
  Language,
  TestFramework,
  RouteStrategy,

  // Provider
  ProviderConfig,
  ModelConfig,

  // Chat
  ChatMessage,
  ToolCall,
  ChatCompletionRequest,
  ChatCompletionResponse,
  Choice,
  UsageInfo,

  // Cost & Routing
  CostRecord,
  CostSummary,
  RouteLog,
  ModelPerformance,
  RoutingEntry,

  // CodeGuard
  HallucinationType,
  HallucinationReport,
  DiffChange,
  DiffResult,
  ScoreDimensions,
  ConfidenceScore,
  TestError,
  TestResult,
  VerifyOptions,
  VerificationReport,

  // Server & Config
  CorsConfig,
  RateLimitConfig,
  LogFormat,
  ServerConfig,
  CostConfig,
  GuardConfig,
  AppConfig,

  // SSE
  SSEEvent,

  // Dashboard
  OverallStats,
  ModelStatus,

  // MCP
  MCPToolDefinition,
  MCPPropertySchema,
  MCPToolResult,

  // Installer
  InstallerTargetId,
  InstallLocation,
  TargetDetectionResult,
  TargetWriteResult,
  TargetInstallOptions,
  InstallerTarget,
} from "@aide-dev/core";

// Re-import for local use in guard-specific interfaces below.
import type { AppConfig } from "@aide-dev/core";

// ==================== Guard-Specific Types ====================

/** File change event */
export interface FileChangeEvent {
  filePath: string;
  event: "add" | "change" | "unlink" | "rename";
}

/** Watch options */
export interface WatchOptions {
  debounceMs?: number;
  extensions?: string[];
  excludeDirs?: string[];
  noTest?: boolean;
  format?: "console" | "json" | "markdown";
}

/** Config profile */
export interface ConfigProfile {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  config: AppConfig;
}

/** Profile list summary */
export interface ProfileSummary {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  updatedAt: number;
}
