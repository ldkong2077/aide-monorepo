/**
 * AIDE Core - Unified Configuration System
 * Loads aide.config.yaml with multi-level fallback and environment variable resolution.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';
import type {
  AppConfig,
  ProviderConfig,
  RoutingEntry,
  GuardConfig,
  CostConfig,
  ServerConfig,
  GraphConfig,
  MindConfig,
} from './types.js';
import { ConfigError } from './errors.js';

// Load .env files
dotenv.config();

/** Default config file name */
export const CONFIG_FILENAME = 'aide.config.yaml';

/** Allowed environment variable patterns (whitelist for security) */
const ALLOWED_ENV_PATTERNS = [
  /_API_KEY$/i,
  /_URL$/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_PASSWORD$/i,
  /_ENDPOINT$/i,
  /^AIDE_/i,
  /^CODESHIELD_/i,
  /^OPENAI_/i,
  /^ANTHROPIC_/i,
  /^DEEPSEEK_/i,
  /^OLLAMA_/i,
  /^AZURE_/i,
  /^GLM_/i,
  /^MINIMAX_/i,
];

function isAllowedEnvVar(varName: string): boolean {
  return ALLOWED_ENV_PATTERNS.some((pattern) => pattern.test(varName));
}

/**
 * Resolve ${ENV_VAR} syntax in config values.
 * Only whitelisted environment variables are resolved for security.
 */
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{(\w+)(?::([^}]*))?\}/g, (_, varName, defaultValue) => {
      if (!isAllowedEnvVar(varName)) {
        return `\${${varName}}`;
      }
      const envValue = process.env[varName];
      if (envValue !== undefined) return envValue;
      if (defaultValue !== undefined) return defaultValue;
      return '';
    });
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  return obj;
}

// ==================== Default Configuration ====================

function getDefaultServer(): ServerConfig {
  return {
    port: 9900,
    dashboard_port: 9901,
    // Default CORS policy: enabled, localhost-only, no credentials.
    // Production deployments MUST override `server.cors.origins` to
    // their public dashboard / client origin (e.g. the k8s Ingress
    // hostname or the standalone deployment's reverse-proxy FQDN).
    cors: {
      enabled: true,
      origins: [
        'http://localhost:9900',
        'http://127.0.0.1:9900',
        'http://localhost:9901',
        'http://127.0.0.1:9901',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      credentials: false,
    },
  };
}

function getDefaultProviders(): Record<string, ProviderConfig> {
  return {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: 'https://api.deepseek.com/v1',
      models: ['deepseek-v4-pro', 'deepseek-flash'],
      enabled: true,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini'],
      enabled: !!process.env.OPENAI_API_KEY,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: 'https://api.anthropic.com',
      models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
    ollama: {
      apiKey: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      models: ['codellama', 'deepseek-coder-v2'],
      enabled: false,
    },
  };
}

function getDefaultRouting(): Record<string, RoutingEntry[]> {
  return {
    code_completion: [
      { model: 'deepseek-flash', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o-mini', provider: 'openai', priority: 2 },
    ],
    code_generation: [
      { model: 'deepseek-v4-pro', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o', provider: 'openai', priority: 2 },
      { model: 'claude-sonnet-4-20250514', provider: 'anthropic', priority: 3 },
    ],
    debugging: [
      { model: 'deepseek-v4-pro', provider: 'deepseek', priority: 1 },
      { model: 'claude-sonnet-4-20250514', provider: 'anthropic', priority: 2 },
    ],
    refactoring: [
      { model: 'deepseek-v4-pro', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o', provider: 'openai', priority: 2 },
    ],
    code_review: [
      { model: 'deepseek-v4-pro', provider: 'deepseek', priority: 1 },
      { model: 'claude-sonnet-4-20250514', provider: 'anthropic', priority: 2 },
    ],
    explanation: [
      { model: 'deepseek-flash', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o-mini', provider: 'openai', priority: 2 },
    ],
    testing: [
      { model: 'deepseek-v4-pro', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o', provider: 'openai', priority: 2 },
    ],
    general: [
      { model: 'deepseek-flash', provider: 'deepseek', priority: 1 },
      { model: 'gpt-4o-mini', provider: 'openai', priority: 2 },
    ],
  };
}

function getDefaultGuard(): GuardConfig {
  return {
    enabled: true,
    hallucinationCheck: true,
    diffAnalysis: true,
    autoRejectThreshold: 30,
    trusted_packages: [
      'react',
      'vue',
      'express',
      'fastify',
      'lodash',
      'axios',
      'numpy',
      'pandas',
      'requests',
      'flask',
    ],
  };
}

function getDefaultCost(): CostConfig {
  return { budgetDaily: 10.0, budget_monthly: 200.0, alertThreshold: 0.8 };
}

function getDefaultGraph(): GraphConfig {
  return {
    enabled: true,
    languages: ['typescript', 'javascript', 'python', 'go'],
    watchMode: false,
  };
}

function getDefaultMind(): MindConfig {
  return { enabled: true, defaultModel: 'deepseek' };
}

/** Get complete default configuration */
export function getDefaultConfig(): AppConfig {
  return {
    server: getDefaultServer(),
    strategy: 'balanced',
    providers: getDefaultProviders(),
    routing: getDefaultRouting(),
    cost: getDefaultCost(),
    guard: getDefaultGuard(),
    graph: getDefaultGraph(),
    mind: getDefaultMind(),
  };
}

// ==================== Config Loading ====================

/** Deep merge two objects (source overrides target) */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

/** Fill provider API keys from environment variables */
function fillProviderApiKeys(
  providers: Record<string, ProviderConfig>,
): Record<string, ProviderConfig> {
  for (const [name, config] of Object.entries(providers)) {
    if (!config.apiKey) {
      const envMap: Record<string, string> = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        deepseek: 'DEEPSEEK_API_KEY',
        ollama: '',
        azure: 'AZURE_OPENAI_API_KEY',
        glm: 'GLM_API_KEY',
        minimax: 'MINIMAX_API_KEY',
      };
      const envVar = envMap[name.toLowerCase()];
      config.apiKey = envVar
        ? process.env[envVar] || ''
        : process.env[`${name.toUpperCase()}_API_KEY`] || '';
    }
    if (name.toLowerCase() === 'ollama' && !config.apiKey) {
      config.apiKey = 'ollama';
    }
  }
  return providers;
}

/**
 * Find config file using multi-level fallback:
 * 1. Explicit path
 * 2. Current working directory
 * 3. User home directory (~/.aide/config.yaml)
 * 4. Built-in defaults
 */
export function findConfigPath(explicitPath?: string): string | null {
  if (explicitPath) {
    if (fs.existsSync(explicitPath)) return explicitPath;
    throw ConfigError.notFound(explicitPath);
  }

  // Check current directory
  const cwdPath = path.resolve(process.cwd(), CONFIG_FILENAME);
  if (fs.existsSync(cwdPath)) return cwdPath;

  // Check user home directory
  const homePath = path.join(os.homedir(), '.aide', CONFIG_FILENAME);
  if (fs.existsSync(homePath)) return homePath;

  return null;
}

/**
 * Load configuration from file with defaults fallback
 */
export function loadConfig(configPath?: string): AppConfig {
  const defaults = getDefaultConfig();
  const filePath = findConfigPath(configPath);

  if (!filePath) return defaults;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawConfig = parseYaml(fileContent);

    if (!rawConfig || typeof rawConfig !== 'object') return defaults;

    const resolved = resolveEnvVars(rawConfig) as Record<string, unknown>;
    const merged = deepMerge(
      defaults as unknown as Record<string, unknown>,
      resolved,
    ) as unknown as AppConfig;

    if (merged.providers) {
      merged.providers = fillProviderApiKeys(merged.providers);
    }

    return merged;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to load config from ${filePath}: ${message}`, {
      suggestion: `Check the YAML syntax in ${filePath} or delete it to use defaults.`,
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Generate a default config file
 */
export function generateDefaultConfigFile(outputDir: string): string {
  const content = `# AIDE Configuration
# Documentation: https://aide.dev/docs/configuration

server:
  port: 9900
  dashboard_port: 9901
  # token: \${AIDE_TOKEN}

# Routing strategy: cost | quality | balanced
strategy: balanced

providers:
  deepseek:
    enabled: true
    apiKey: \${DEEPSEEK_API_KEY}
    baseUrl: https://api.deepseek.com/v1
    models:
      - deepseek-v4-pro
      - deepseek-flash

  openai:
    enabled: false
    apiKey: \${OPENAI_API_KEY}
    baseUrl: https://api.openai.com/v1
    models:
      - gpt-4o
      - gpt-4o-mini

  anthropic:
    enabled: false
    apiKey: \${ANTHROPIC_API_KEY}
    baseUrl: https://api.anthropic.com
    models:
      - claude-sonnet-4-20250514
      - claude-3-5-haiku-20241022

  ollama:
    enabled: false
    apiKey: ollama
    baseUrl: http://localhost:11434/v1
    models:
      - codellama
      - deepseek-coder-v2

routing:
  code_completion:
    - model: deepseek-flash
      provider: deepseek
      priority: 1
    - model: gpt-4o-mini
      provider: openai
      priority: 2
  code_generation:
    - model: deepseek-v4-pro
      provider: deepseek
      priority: 1
    - model: gpt-4o
      provider: openai
      priority: 2
  debugging:
    - model: deepseek-v4-pro
      provider: deepseek
      priority: 1
  refactoring:
    - model: deepseek-v4-pro
      provider: deepseek
      priority: 1
  code_review:
    - model: deepseek-v4-pro
      provider: deepseek
      priority: 1
  explanation:
    - model: deepseek-flash
      provider: deepseek
      priority: 1
  testing:
    - model: deepseek-v4-pro
      provider: deepseek
      priority: 1
  general:
    - model: deepseek-flash
      provider: deepseek
      priority: 1

guard:
  enabled: true
  hallucinationCheck: true
  diffAnalysis: true
  autoRejectThreshold: 30
  trusted_packages:
    - react
    - vue
    - express
    - fastify
    - lodash
    - axios
    - numpy
    - pandas
    - requests
    - flask

graph:
  enabled: true
  languages:
    - typescript
    - javascript
    - python
    - go
  watchMode: false

mind:
  enabled: true
  defaultModel: deepseek

cost:
  budgetDaily: 10.0
  budget_monthly: 200.0
  alertThreshold: 0.8
`;

  const filePath = path.join(outputDir, CONFIG_FILENAME);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
