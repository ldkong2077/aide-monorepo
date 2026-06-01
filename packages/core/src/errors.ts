/**
 * AIDE Core - Unified Error Hierarchy
 * All errors thrown by AIDE packages should extend AideError.
 */

/** Error severity levels */
export type ErrorSeverity = 'fatal' | 'error' | 'warning';

/** Base error class for all AIDE errors */
export class AideError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** Whether the error is recoverable */
  readonly recoverable: boolean;
  /** Severity level */
  readonly severity: ErrorSeverity;
  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;
  /** User-friendly fix suggestion */
  readonly suggestion?: string;

  constructor(opts: {
    message: string;
    code: string;
    recoverable?: boolean;
    severity?: ErrorSeverity;
    context?: Record<string, unknown>;
    suggestion?: string;
    cause?: Error;
  }) {
    super(opts.message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = 'AideError';
    this.code = opts.code;
    this.recoverable = opts.recoverable ?? false;
    this.severity = opts.severity ?? 'error';
    this.context = opts.context;
    this.suggestion = opts.suggestion;
  }

  /** Format error for CLI output */
  toFormattedString(): string {
    const lines = [`[${this.code}] ${this.message}`];
    if (this.suggestion) lines.push(`  Hint: ${this.suggestion}`);
    if (this.context && Object.keys(this.context).length > 0) {
      lines.push(`  Context: ${JSON.stringify(this.context)}`);
    }
    return lines.join('\n');
  }
}

/** Configuration errors */
export class ConfigError extends AideError {
  constructor(message: string, opts?: { recoverable?: boolean; context?: Record<string, unknown>; suggestion?: string; cause?: Error }) {
    super({ message, code: 'CONFIG_ERROR', recoverable: opts?.recoverable ?? true, severity: 'error', ...opts });
    this.name = 'ConfigError';
  }

  static notFound(path: string): ConfigError {
    return new ConfigError(`Configuration file not found: ${path}`, {
      recoverable: true,
      suggestion: 'Run "aide init" to generate a default configuration, or create aide.config.yaml manually.',
    });
  }

  static invalidField(field: string, reason: string): ConfigError {
    return new ConfigError(`Invalid configuration field "${field}": ${reason}`, {
      recoverable: true,
      suggestion: `Check the "${field}" field in your aide.config.yaml file.`,
    });
  }
}

/** CodeGuard verification errors */
export class GuardError extends AideError {
  constructor(message: string, opts?: { recoverable?: boolean; context?: Record<string, unknown>; suggestion?: string; cause?: Error }) {
    super({ message, code: 'GUARD_ERROR', recoverable: opts?.recoverable ?? false, severity: 'error', ...opts });
    this.name = 'GuardError';
  }

  static verificationFailed(file: string, reason: string): GuardError {
    return new GuardError(`Verification failed for ${file}: ${reason}`, {
      recoverable: true,
      suggestion: `Review the reported issues in ${file} and fix them before re-verifying.`,
    });
  }

  static parseError(file: string, language: string, cause?: Error): GuardError {
    return new GuardError(`Failed to parse ${file} as ${language}`, {
      recoverable: false,
      suggestion: `Ensure the file is valid ${language} syntax and the language is supported.`,
      cause,
    });
  }
}

/** Route/model routing errors */
export class RouteError extends AideError {
  constructor(message: string, opts?: { recoverable?: boolean; context?: Record<string, unknown>; suggestion?: string; cause?: Error }) {
    super({ message, code: 'ROUTE_ERROR', recoverable: opts?.recoverable ?? true, severity: 'error', ...opts });
    this.name = 'RouteError';
  }

  static providerUnavailable(provider: string): RouteError {
    return new RouteError(`Provider "${provider}" is unavailable`, {
      recoverable: true,
      suggestion: `Check that ${provider} is enabled in aide.config.yaml and the API key is configured.`,
    });
  }

  static noRouteAvailable(taskType: string): RouteError {
    return new RouteError(`No route available for task type "${taskType}"`, {
      recoverable: false,
      suggestion: 'Ensure at least one provider is enabled and has models configured.',
    });
  }
}

/** CodeGraph errors */
export class GraphError extends AideError {
  constructor(message: string, opts?: { recoverable?: boolean; context?: Record<string, unknown>; suggestion?: string; cause?: Error }) {
    super({ message, code: 'GRAPH_ERROR', recoverable: opts?.recoverable ?? false, severity: 'error', ...opts });
    this.name = 'GraphError';
  }

  static notInitialized(projectDir: string): GraphError {
    return new GraphError(`CodeGraph is not initialized in ${projectDir}`, {
      recoverable: true,
      suggestion: 'Run "aide init" or "aide index" to initialize the code graph.',
    });
  }

  static unsupportedLanguage(language: string): GraphError {
    return new GraphError(`Unsupported language: ${language}`, {
      recoverable: false,
      suggestion: 'Supported languages: typescript, javascript, python, go, rust, java.',
    });
  }
}

/** Project-Mind errors */
export class MindError extends AideError {
  constructor(message: string, opts?: { recoverable?: boolean; context?: Record<string, unknown>; suggestion?: string; cause?: Error }) {
    super({ message, code: 'MIND_ERROR', recoverable: opts?.recoverable ?? true, severity: 'error', ...opts });
    this.name = 'MindError';
  }

  static modelNotConfigured(model: string): MindError {
    return new MindError(`Model "${model}" is not configured`, {
      recoverable: true,
      suggestion: `Add ${model} to your providers in aide.config.yaml and ensure the API key is set.`,
    });
  }
}
