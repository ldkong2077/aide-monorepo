/**
 * CodeShield - HTTP 代理服务器
 * 基于 Fastify 的 AI 模型代理，支持请求路由、流式转发和成本记录
 */

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
  type FastifyError,
} from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import type {
  AppConfig,
  ChatCompletionRequest,
  TaskType,
  CostRecord,
  ChatMessage,
  UsageInfo,
  VerificationReport,
  Language,
  SSEEvent,
} from '../types.js';
import { ProviderRegistry, type BaseProvider, type ProviderCallOptions } from '../provider/index.js';
import { RouteEngine, MODEL_CONFIGS } from '../router/index.js';
import { forwardSSE, extractTokenUsageFromSSE, estimateTokenUsage } from './stream.js';
import type { Storage } from '../storage/index.js';
import { Verifier } from '../guard/verifier.js';
import { readiness } from './readiness.js';
import { TokenBucketRateLimiter, DEFAULT_RATE_LIMIT } from './rate-limit.js';
import { RedisTokenBucketRateLimiter } from './redis-rate-limit.js';
import { createMetrics, bucketStatusCode, type MetricsBundle } from './metrics.js';
import { TenantCostTracker, DEFAULT_TENANT_CIRCUIT } from './tenant-circuit.js';
import { RedisTenantCostTracker } from './redis-tenant-circuit.js';
import { UpstreamTimeoutError } from '../provider/retry.js';
import { type LLMCache, computeRequestHash } from '../cache/index.js';
import { TokenBudgetEnforcer } from './token-budget.js';
import { Redis, type RedisOptions } from 'ioredis';

/** Paths exempt from Bearer-token auth. Health endpoints and the
 *  Prometheus scrape endpoint are always reachable so liveness /
 *  readiness probes and metrics scrapers don't need credentials. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/health', '/readyz', '/metrics']);

/** Extract the inbound request id, honouring an explicit
 *  `X-Request-Id` from the client and falling back to Fastify's
 *  auto-generated `request.id`. The returned value is what we
 *  surface in the response header and forward to upstream. */
function resolveRequestId(
  request: FastifyRequest,
): string {
  const inbound = request.headers['x-request-id'];
  if (typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 200) {
    return inbound;
  }
  return request.id;
}

/** Extract the inbound tenant id, honouring `X-Tenant-Id` from the
 *  client. When the header is absent we fall back to `"default"`
 *  so single-tenant deployments do not have to configure anything.
 *  The header is length-bounded to keep label cardinality bounded
 *  in Prometheus metrics. */
function resolveTenantId(
  request: FastifyRequest,
): string {
  const inbound = request.headers['x-tenant-id'];
  if (typeof inbound === 'string' && inbound.length > 0) {
    // Bound the value defensively. Tenant ids in the wild are
    // short opaque strings (UUIDs, slugs, org names). Anything
    // longer is almost certainly a misconfiguration.
    return inbound.slice(0, 64);
  }
  return 'default';
}

/** Decide which Fastify logger config to use.
 *  - 'json' (or `LOG_FORMAT=json` env): pino default — one JSON
 *    object per line, suitable for log aggregators.
 *  - 'pretty' (default for dev): routes through pino-pretty for
 *    human-readable, coloured output.
 *
 *  Extracted so it can be unit-tested without spinning up a
 *  real server. */
export function resolveLoggerConfig(format?: 'json' | 'pretty') {
  const effective: 'json' | 'pretty' = format ?? (process.env.LOG_FORMAT === 'json' ? 'json' : 'pretty');
  if (effective === 'json') {
    return { level: process.env.LOG_LEVEL ?? 'info' };
  }
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  };
}

// ==================== 代理服务器 ====================

/** 恒定时间字符串比较，防止时序攻击 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const maxLen = Math.max(a.length, b.length);
    const bufA = Buffer.concat([Buffer.from(a), Buffer.alloc(maxLen - a.length)]);
    const bufB = Buffer.concat([Buffer.from(b), Buffer.alloc(maxLen - b.length)]);
    return crypto.timingSafeEqual(bufA, bufB);
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** 代理服务器选项 */
export interface ProxyServerOptions {
  config: AppConfig;
  storage?: Storage;
  registry?: ProviderRegistry;
  routeEngine?: RouteEngine;
  /**
   * Optional LLM response cache. When supplied, non-streaming
   * `/v1/chat/completions` requests are checked against the cache
   * before calling upstream, and successful responses are stored
   * back. Omit to disable caching.
   *
   * Streaming requests (`stream: true`) are never cached — buffering
   * them would defeat the purpose of streaming.
   */
  cache?: LLMCache;
  /**
   * Optional per-tenant token budget enforcer. When supplied, every
   * chat-completion request is pre-flighted for prompt-token count
   * (rejecting with 413 on per-request overflow) and tracked against
   * a daily token budget (rejecting with 429 on daily overflow).
   *
   * If omitted, the proxy still records token usage on the metrics
   * gauges but does not enforce any cap.
   */
  tokenBudget?: TokenBudgetEnforcer;
}

/**
 * 创建并配置代理服务器
 */
export async function createProxyServer(options: ProxyServerOptions): Promise<FastifyInstance> {
  const { config, storage } = options;

  // One isolated metrics bundle per server instance. Tests get fresh
  // bundles; production gets a single bundle that lives for the
  // process lifetime and is scraped via `GET /metrics`.
  const metrics: MetricsBundle = createMetrics();

  const fastify = Fastify({
    bodyLimit: config.server.bodyLimit || 1048576, // 默认 1MB
    logger: resolveLoggerConfig(config.server.logFormat),
  });

  // CORS — fully config-driven. The defaults (see
  // `getDefaultServer()` in `@aide/core`) give a localhost-only
  // allow-list so the bundled dashboard works out of the box;
  // production deployments MUST override `server.cors.origins`
  // via `aide.config.yaml` to the public origin.
  const corsConfig = config.server.cors;
  if (corsConfig?.enabled) {
    await fastify.register(cors, {
      origin: corsConfig.origins,
      methods: corsConfig.methods ?? ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: corsConfig.allowedHeaders ?? [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
      ],
      credentials: corsConfig.credentials ?? false,
    });
  }

  // 安全响应头（轻量替代 @fastify/helmet，避免新增依赖）
  // 这些头防御 MIME 嗅探、点击劫持、引用泄露；不影响功能，仅强化默认安全姿态。
  // 注意：HSTS 在 HTTP 下无意义（浏览器会忽略），且本代理的 CORS 允许列表限定
  // 为 localhost（仅本机访问），生产部署应放在反向代理后并由该层加 HSTS。
  fastify.addHook('onSend', async (request, reply) => {
    const headers: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      // Request-id correlation: every response echoes the id used in
      // the proxy logs and forwarded to upstream providers. Clients
      // can supply their own via X-Request-Id; we fall back to
      // Fastify's auto-generated id.
      'X-Request-Id': resolveRequestId(request),
    };
    for (const [k, v] of Object.entries(headers)) {
      if (!reply.hasHeader(k)) reply.header(k, v);
    }
  });

  // Redis connection (optional). When configured, rate-limit and
  // circuit-breaker state is shared across replicas.
  let redis: Redis | null = null;
  if (config.server.redis?.url) {
    const redisOpts: RedisOptions = {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
    redis = new Redis(config.server.redis.url, redisOpts);
    try {
      await redis.connect();
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to connect to Redis — falling back to in-process state');
      redis = null;
    }
  }

  // Rate limiter: Redis-backed when available, in-process otherwise.
  const rateLimiter = config.server.rateLimit
    ? redis
      ? new RedisTokenBucketRateLimiter(redis, {
          limit: config.server.rateLimit.limit ?? DEFAULT_RATE_LIMIT.limit,
          windowMs: config.server.rateLimit.windowMs ?? DEFAULT_RATE_LIMIT.windowMs,
        })
      : new TokenBucketRateLimiter({
          limit: config.server.rateLimit.limit ?? DEFAULT_RATE_LIMIT.limit,
          windowMs: config.server.rateLimit.windowMs ?? DEFAULT_RATE_LIMIT.windowMs,
        })
    : null;

  // Tenant cost circuit breaker: Redis-backed when available, in-process otherwise.
  const tenantTracker = redis
    ? new RedisTenantCostTracker(redis, {
        budgetDaily: config.cost.budgetDaily ?? DEFAULT_TENANT_CIRCUIT.budgetDaily,
        alertThreshold: config.cost.alertThreshold ?? DEFAULT_TENANT_CIRCUIT.alertThreshold,
      })
    : new TenantCostTracker({
        budgetDaily: config.cost.budgetDaily ?? DEFAULT_TENANT_CIRCUIT.budgetDaily,
        alertThreshold: config.cost.alertThreshold ?? DEFAULT_TENANT_CIRCUIT.alertThreshold,
      });

  // Optional per-tenant token budget enforcer. Constructed from
  // `config.server.tokenBudget` when present, otherwise left to
  // whatever the caller passed via `options.tokenBudget`. Either
  // path leaves the value as `null` when nothing is configured, so
  // the rest of the proxy can branch on a single truthy check.
  const tokenBudget =
    options.tokenBudget ??
    (config.server.tokenBudget
      ? new TokenBudgetEnforcer({
          maxPromptTokensPerRequest: config.server.tokenBudget.maxPromptTokensPerRequest,
          maxTokensPerTenantPerDay: config.server.tokenBudget.maxTokensPerTenantPerDay,
          circuitResetMs: config.server.tokenBudget.circuitResetMs,
        })
      : null);

  fastify.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url)) return;

    // Tenant cost circuit breaker. Runs BEFORE the rate limiter
    // so a tenant that has already exhausted its daily budget
    // does not even get a 429/200 distinction — it gets a
    // dedicated `cost_circuit_open` error. Without this, a
    // misbehaving client could race a half-second window between
    // a spend spike and the breaker tripping.
    const tenantId = resolveTenantId(request);
    if (await tenantTracker.isCircuitOpen(tenantId)) {
      metrics.tenantCircuitRejections.inc({ tenant: tenantId });
      reply.header('X-Tenant-Id', tenantId);
      return reply.status(429).send({
        error: {
          message: `Tenant "${tenantId}" cost circuit is open. Daily budget exhausted.`,
          type: 'cost_circuit_open',
          tenant: tenantId,
        },
        request_id: resolveRequestId(request),
      });
    }

    // Rate-limit gate. Keyed on the raw token string; the
    // rate-limit decision does not require the token to be valid
    // (so a misconfigured client doesn't get a free pass).
    if (rateLimiter) {
      const authHeader = request.headers.authorization;
      // Skip the rate limit when the request will 401 anyway — we
      // don't want random anonymous traffic to consume slots of a
      // token the attacker doesn't actually have.
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const tokenKey = authHeader.slice('Bearer '.length);
        const result = await rateLimiter.check(tokenKey);
        // Always advertise the limit state on the response.
        reply.header('X-RateLimit-Limit', String(rateLimiter.getConfig().limit));
        if (!result.allowed) {
          reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
          reply.header('X-RateLimit-Remaining', '0');
          reply.header('X-Tenant-Id', tenantId);
          metrics.rateLimitRejections.inc();
          return reply.status(429).send({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
              retry_after_ms: result.retryAfterMs,
              tenant: tenantId,
            },
          });
        }
        reply.header('X-RateLimit-Remaining', String(result.remaining));
        reply.header('X-Tenant-Id', tenantId);
      }
    }

    // Auth gate (only when a token is configured).
    if (config.server.token) {
      const authHeader = request.headers.authorization;
      const expected = `Bearer ${config.server.token}`;
      if (!authHeader || !timingSafeEqual(authHeader, expected)) {
        metrics.authFailures.inc();
        reply.status(401).send({
          error: { message: 'Unauthorized', type: 'auth_error' },
          request_id: resolveRequestId(request),
        });
      }
    }
  });

  // HTTP-level metrics: in-flight gauge + per-request duration timer.
  // We store the start time on the request object so the onResponse
  // hook (which fires after the response is fully sent) can compute
  // the wall-clock duration.
  fastify.addHook('onRequest', async (request) => {
    metrics.httpInFlight.inc();
    (request as FastifyRequest & { _aideStartNs?: bigint })._aideStartNs = process.hrtime.bigint();
  });
  fastify.addHook('onResponse', async (request, reply) => {
    metrics.httpInFlight.dec();
    const startNs = (request as FastifyRequest & { _aideStartNs?: bigint })._aideStartNs;
    if (startNs !== undefined) {
      const seconds = Number(process.hrtime.bigint() - startNs) / 1e9;
      const route = request.routeOptions?.url ?? 'unknown';
      metrics.httpDuration.observe({ method: request.method, route }, seconds);
      metrics.httpRequests.inc({
        method: request.method,
        route,
        status_code: bucketStatusCode(reply.statusCode),
      });
    }
  });

  if (!config.server.token) {
    fastify.log.warn('⚠️ 未配置 server.token，代理服务器 API 无认证保护！');
  }

  // 使用外部传入或内部创建的 Provider 注册表
  const registry = options.registry || new ProviderRegistry();
  if (!options.registry) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.enabled) {
        registry.registerProvider(name, providerConfig);
      }
    }
  }

  // 使用外部传入或内部创建的路由引擎
  const routeEngine =
    options.routeEngine ||
    new RouteEngine({
      strategy: config.strategy,
      routingTable: config.routing,
    });
  if (!options.routeEngine) {
    routeEngine.setEnabledProviders(
      Object.entries(config.providers)
        .filter(([, c]) => c.enabled)
        .map(([name]) => name),
    );
  }

  // ==================== 中间件 ====================

  // 请求日志
  fastify.addHook('onRequest', async (request) => {
    request.log.info({ method: request.method, url: request.url }, '收到请求');
  });

  // 错误处理
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: {
        message: error.message || '内部服务器错误',
        type: error.name || 'internal_error',
      },
      request_id: resolveRequestId(request),
    });
  });

  // ==================== 路由 ====================

  /**
   * POST /v1/chat/completions - 主要代理端点
   *
   * Dispatcher only: validates the request shape, classifies the task,
   * picks a route, and hands off to one of three focused handlers:
   *   - handleStreaming:    streams a response via SSE
   *   - handleNonStreaming: returns a buffered JSON response
   *   - handleErrorFallback: tries the next-best route on failure
   *
   * The split was introduced in P0-3 to fix the header-race condition in
   * the previous monolithic handler: when a stream had already started,
   * a later error could not send a 502 (headers were flushed) and
   * silently left the connection in an undefined state.
   */
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ChatCompletionRequest;
    if (!body?.messages || body.messages.length === 0) {
      return reply.status(400).send({
        error: { message: '缺少 messages 字段', type: 'invalid_request_error' },
        request_id: resolveRequestId(request),
      });
    }

    const startTime = Date.now();
    const originalModel = body.model;
    const taskType = routeEngine.classifyTask(body.messages);
    const route = routeEngine.route(taskType, originalModel);
    const tenantId = resolveTenantId(request);

    const ctx: RouteContext = {
      originalModel,
      route,
      taskType,
      startTime,
      routeEngine,
      storage,
      config,
      requestId: resolveRequestId(request),
      tenantId,
      metrics,
      tenantTracker,
      cache: options.cache,
      tokenBudget,
    };

    // Token budget pre-flight. Runs before provider lookup so a
    // tenant that has already exhausted its daily budget is not
    // even charged the cost of constructing a RouteContext. The
    // decision is informational (recorded on the metrics bundle)
    // but the prompt is never sent upstream on a rejection.
    if (tokenBudget) {
      const decision = tokenBudget.check(tenantId, body.messages, route.model);
      if (!decision.allowed) {
        metrics.tokenBudgetRejections.inc({ tenant: tenantId, reason: decision.reason });
        reply.header('X-Tenant-Id', tenantId);
        if (decision.reason === 'per_request') {
          return reply.status(413).send({
            error: {
              message: `Request exceeds per-request prompt-token cap`,
              type: 'token_budget_exceeded',
              reason: 'per_request',
              estimated_prompt_tokens: decision.estimatedPromptTokens,
            },
            request_id: resolveRequestId(request),
          });
        }
        if (decision.retryAfterMs > 0) {
          reply.header('Retry-After', String(Math.ceil(decision.retryAfterMs / 1000)));
        }
        return reply.status(429).send({
          error: {
            message: `Tenant "${tenantId}" has reached its daily token budget`,
            type: 'token_budget_exceeded',
            reason: 'per_tenant_daily',
            tenant_daily_tokens: decision.tenantDailyBefore,
            retry_after_ms: decision.retryAfterMs,
          },
          request_id: resolveRequestId(request),
        });
      }
      // Stash the pre-flight estimate so the handler can pass it
      // to `tokenBudget.record()` after the upstream returns.
      (
        ctx as RouteContext & { _tokenEstimate?: { promptTokens: number } }
      )._tokenEstimate = { promptTokens: decision.estimatedPromptTokens };
    }

    const provider = registry.getProvider(route.provider);
    if (!provider) {
      return reply.status(502).send({
        error: {
          message: `Provider "${route.provider}" 不可用`,
          type: 'provider_error',
        },
        request_id: resolveRequestId(request),
      });
    }

    const routedRequest: ChatCompletionRequest = {
      ...body,
      model: route.model,
    };

    try {
      if (body.stream) {
        return await handleStreaming(provider, routedRequest, reply, ctx);
      } else {
        return await handleNonStreaming(provider, routedRequest, reply, ctx);
      }
    } catch (error) {
      return await handleErrorFallback(
        error,
        registry,
        provider,
        routedRequest,
        reply,
        request,
        ctx,
      );
    }
  });

  /**
   * POST /v1/models - 列出可用模型
   */
  fastify.get('/v1/models', async () => {
    const models: { id: string; object: string; created: number; owned_by: string }[] = [];
    for (const [providerName, provider] of registry.getAllProviders()) {
      for (const modelId of provider.getModels()) {
        models.push({
          id: modelId,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: providerName,
        });
      }
    }
    return { object: 'list', data: models };
  });

  /**
   * GET /health - liveness check
   *
   * Returns 200 as long as the process is responding. We deliberately do
   * NOT gate this on upstream provider health — a transient OpenAI
   * outage should not get the pod killed and restarted.
   */
  fastify.get('/health', async () => {
    const health = await registry.healthCheckAll();
    const allHealthy = Object.values(health).every((v) => v);
    return {
      status: allHealthy ? 'ok' : 'degraded',
      providers: health,
      timestamp: Date.now(),
    };
  });

  /**
   * GET /readyz - readiness check
   *
   * Returns 200 only when the server is fully initialised AND not on its
   * way down. Used by Kubernetes (and other orchestrators) to decide
   * whether to keep the pod in the Service endpoint list. During a
   * rolling update the orchestrator will get 503 from this endpoint
   * before the new pod is ready, so the old pod keeps receiving
   * traffic until it's drained.
   */
  fastify.get('/readyz', async (_request, reply) => {
    if (!readiness.hasStarted()) {
      return reply.status(503).send({
        ready: false,
        reason: 'starting',
        timestamp: Date.now(),
      });
    }
    if (readiness.isShuttingDown()) {
      return reply.status(503).send({
        ready: false,
        reason: 'shutting_down',
        timestamp: Date.now(),
      });
    }
    const health = await registry.healthCheckAll();
    const allHealthy = Object.values(health).every((v) => v);
    if (!allHealthy) {
      return reply.status(503).send({
        ready: false,
        reason: 'upstream_unhealthy',
        providers: health,
        timestamp: Date.now(),
      });
    }
    return { ready: true, providers: health, timestamp: Date.now() };
  });

  /**
   * GET /metrics - Prometheus text exposition format (OpenMetrics 1.0).
   *
   * Public endpoint (no auth) because scraping is performed by
   * infrastructure that doesn't carry the AIDE Bearer token. The
   * metrics are read-only operational data; no upstream secrets or
   * request bodies are exposed.
   */
  fastify.get('/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return await metrics.register.metrics();
  });

  /**
   * GET /v1/tenants/cost - Per-tenant cost snapshot.
   *
   * Returns the per-tenant daily spend and circuit-breaker state
   * for the requested `tenant` query parameter (default: the
   * `"default"` tenant). When `tenant=all` is supplied, every
   * tracked tenant is returned. Auth-gated by the standard
   * Bearer-token flow; the response body is intentionally
   * aggregate-only (no per-request cost data).
   */
  fastify.get('/v1/tenants/cost', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenant?: string };
    const wanted = query.tenant ?? 'default';
    if (wanted === 'all') {
      return reply.send({
        config: tenantTracker.getConfig(),
        tenants: await collectAllTenantSnapshots(tenantTracker),
      });
    }
    const snap = await tenantTracker.snapshot(wanted);
    return reply.send({
      config: tenantTracker.getConfig(),
      tenant: wanted,
      ...(snap ?? { dailyUsd: 0, thresholdUsd: 0, circuitOpen: false }),
    });
  });

  /**
   * POST /v1/tenants/:id/reset-circuit - Reset a single tenant's
   * circuit breaker.
   *
   * Intended for the on-call operator who has decided to lift
   * the breaker after a runaway agent was fixed. The endpoint
   * is auth-gated; the request body is ignored.
   */
  fastify.post<{ Params: { id: string } }>(
    '/v1/tenants/:id/reset-circuit',
    async (request, reply) => {
      const tenantId = request.params.id;
      if (typeof tenantId !== 'string' || tenantId.length === 0 || tenantId.length > 64) {
        return reply.status(400).send({
          error: { message: 'Invalid tenant id', type: 'invalid_request' },
        });
      }
      await tenantTracker.reset(tenantId);
      return reply.send({ success: true, tenant: tenantId });
    },
  );

  /**
   * GET /v1/tenants/tokens - Per-tenant token-budget snapshot.
   *
   * Auth-gated; same response shape conventions as
   * `/v1/tenants/cost`. The `tenant` query param accepts `"all"`
   * to dump every tracked tenant. Returns an empty object when
   * the budget enforcer is not configured — the operator still
   * gets a 200 so dashboards can render an "unconfigured" state
   * without special-casing 404s.
   */
  fastify.get('/v1/tenants/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenant?: string };
    const wanted = query.tenant ?? 'default';
    if (!tokenBudget) {
      return reply.send({ enabled: false, tenants: [] });
    }
    if (wanted === 'all') {
      return reply.send({
        enabled: true,
        config: tokenBudget.getConfig(),
        tenants: tokenBudget.snapshotAll(),
      });
    }
    const snap = tokenBudget.snapshot(wanted);
    return reply.send({
      enabled: true,
      config: tokenBudget.getConfig(),
      tenant: wanted,
      ...(snap ?? { dailyTokens: 0, dailyResetAt: 0, circuitOpenUntil: 0, percentOfDailyBudget: 0 }),
    });
  });

  /**
   * POST /v1/tenants/:id/reset-token-budget - Reset a single
   * tenant's daily token counter and circuit state. Mirror of
   * `reset-circuit` for the token budget. Auth-gated.
   */
  fastify.post<{ Params: { id: string } }>(
    '/v1/tenants/:id/reset-token-budget',
    async (request, reply) => {
      if (!tokenBudget) {
        return reply.status(400).send({
          error: { message: 'Token budget enforcer is not configured', type: 'unconfigured' },
        });
      }
      const tenantId = request.params.id;
      if (typeof tenantId !== 'string' || tenantId.length === 0 || tenantId.length > 64) {
        return reply.status(400).send({
          error: { message: 'Invalid tenant id', type: 'invalid_request' },
        });
      }
      tokenBudget.reset(tenantId);
      return reply.send({ success: true, tenant: tenantId });
    },
  );

  // Refresh the ready_state gauge once per second. The gauge reflects
  // /readyz's verdict so dashboards can graph it directly without
  // having to parse the JSON body of the readiness endpoint.
  // `.unref()` so the interval never holds the event loop open.
  const readyStateTimer = setInterval(() => {
    metrics.readyState.set(readiness.isReady() ? 1 : 0);
  }, 1000);
  readyStateTimer.unref();

  // ==================== Guard 验证端点 ====================

  /**
   * POST /v1/guard/verify - 异步验证代码
   * 对 AI 生成的代码进行幻觉检测、AST差异分析和置信度评分
   */
  fastify.post('/v1/guard/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      path?: string;
      code?: string;
      language?: string;
      diff?: { base: string; head: string };
      staged?: boolean;
      skipTests?: boolean;
    };

    if (!config.guard.enabled) {
      return reply.status(400).send({
        error: {
          message: 'CodeGuard 未启用，请在配置中设置 guard.enabled = true',
          type: 'guard_disabled',
        },
      });
    }

    const verifier = new Verifier(storage);

    try {
      // 如果提供了代码片段，直接进行幻觉检测
      if (body.code && body.language) {
        const { HallucinationDetector } = await import('../guard/hallucination.js');
        const detector = new HallucinationDetector(storage);
        const hallucinations = detector.detect(
          body.code,
          body.language as Language,
          process.cwd(),
        );

        const report: VerificationReport = {
          id: `cg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          timestamp: Date.now(),
          options: { format: 'json' },
          files_checked: ['inline-code'],
          diffResults: [],
          hallucinations,
          testResult: undefined,
          confidence: {
            overall:
              hallucinations.length === 0 ? 100 : Math.max(0, 100 - hallucinations.length * 15),
            verdict:
              hallucinations.length === 0
                ? 'TRUST'
                : hallucinations.some((h) => h.severity === 'high' || h.severity === 'critical')
                  ? 'REJECT'
                  : 'REVIEW',
            dimensions: {
              diffSafety: 100,
              hallucinationFree:
                hallucinations.length === 0 ? 100 : Math.max(0, 100 - hallucinations.length * 20),
              testPassRate: 100,
              typeCheck: 100,
            },
            riskFactors: hallucinations.map((h) => h.message),
          },
          summary:
            hallucinations.length === 0
              ? '未检测到幻觉问题'
              : `检测到 ${hallucinations.length} 个潜在问题`,
        };

        if (storage) {
          storage.recordVerification(report);
        }

        return reply.send(report);
      }

      // 否则按路径验证
      const report = await verifier.verify({
        path: body.path || process.cwd(),
        diff: body.diff,
        staged: body.staged,
        noTest: body.skipTests ?? true,
      });

      return reply.send(report);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({
        error: { message: `验证失败: ${errMsg}`, type: 'guard_error' },
      });
    }
  });

  /**
   * GET /v1/guard/rules - 获取自定义幻觉检测规则
   */
  fastify.get('/v1/guard/rules', async (request: FastifyRequest) => {
    const query = request.query as { language?: string };
    if (!storage) {
      return { rules: [] };
    }
    const rules = storage.getHallucinationRules(query.language);
    return { rules };
  });

  /**
   * POST /v1/guard/rules - 添加自定义幻觉检测规则
   */
  fastify.post('/v1/guard/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      category: string;
      pattern: string;
      language?: string;
      severity?: string;
      message: string;
      suggestion?: string;
    };

    if (!storage) {
      return reply.status(400).send({
        error: { message: '存储未初始化', type: 'storage_error' },
      });
    }

    if (!body.category || !body.pattern || !body.message) {
      return reply.status(400).send({
        error: { message: '缺少必要字段: category, pattern, message', type: 'invalid_request' },
      });
    }

    storage.addHallucinationRule(body);
    return reply.send({ success: true });
  });

  /**
   * GET /v1/guard/trusted-packages - 获取可信包列表
   */
  fastify.get('/v1/guard/trusted-packages', async (request: FastifyRequest) => {
    const query = request.query as { language?: string };
    if (!storage) {
      return { packages: [] };
    }
    const packages = storage.getTrustedPackages(query.language);
    return { packages };
  });

  /**
   * POST /v1/guard/trusted-packages - 添加可信包
   */
  fastify.post(
    '/v1/guard/trusted-packages',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { name: string; language?: string };

      if (!storage) {
        return reply.status(400).send({
          error: { message: '存储未初始化', type: 'storage_error' },
        });
      }

      if (!body.name) {
        return reply.status(400).send({
          error: { message: '缺少必要字段: name', type: 'invalid_request' },
        });
      }

      storage.addTrustedPackage(body.name, body.language);
      return reply.send({ success: true });
    },
  );

  // Flip the readiness flag right before returning. From this point on,
  // /readyz will return 200 (assuming upstream providers are healthy).
  readiness.markStarted();
  return fastify;
}

// ==================== 辅助函数 ====================

/** 路由上下文 — 三个 handler 共享的只读快照 */
interface RouteContext {
  originalModel: string;
  route: { provider: string; model: string };
  taskType: TaskType;
  startTime: number;
  routeEngine: RouteEngine;
  storage?: Storage;
  config: AppConfig;
  requestId: string;
  tenantId: string;
  metrics: MetricsBundle;
  /** The per-process or Redis-backed tenant cost tracker.
   *  Accepts either implementation so the proxy supports single-replica
   *  (in-process Map) and multi-replica (Redis sorted sets) deployments
   *  transparently. */
  tenantTracker: TenantCostTracker | RedisTenantCostTracker;
  /** Optional LLM response cache. When present, the non-streaming
   *  handler consults it before calling upstream and stores the
   *  response afterwards. Streaming is never cached. */
  cache?: LLMCache;
  /** Optional per-tenant token budget enforcer. When present,
   *  the dispatcher pre-flights the prompt-token count and records
   *  actual usage after each call. Streaming responses also feed
   *  the per-tenant daily counter, but the prompt-side check is
   *  the only pre-flight gate. */
  tokenBudget: TokenBudgetEnforcer | null;
}

/**
 * 处理非流式请求 — 缓冲 JSON 响应,headers 一次性返回。
 * 错误时整个响应回退到 502 (见 handleErrorFallback)。
 *
 * If a cache is configured on the proxy AND the request is
 * non-streaming, we consult the cache first. On a hit we skip the
 * upstream call entirely (no cost, no latency, no rate-limit
 * pressure) and emit the cached response with `X-Cache: HIT`. On a
 * miss we call upstream, then store the response for the next
 * caller. The cache key is the SHA-256 of (model + messages + sampling
 * params), so identical requests from any tenant hit the same entry.
 */
async function handleNonStreaming(
  provider: BaseProvider,
  request: ChatCompletionRequest,
  reply: FastifyReply,
  ctx: RouteContext,
): Promise<FastifyReply> {
  // Cache lookup is a fast path: if the cache has the response, we
  // short-circuit the upstream call AND skip cost / route-log
  // recording (we never spent any money). Hit count is recorded as
  // `aide_cache_hits_total{model="..."}` so dashboards can attribute
  // the savings back to the model.
  if (ctx.cache) {
    const requestHash = computeRequestHash(ctx.route.model, request.messages, request);
    const hit = ctx.cache.lookup(ctx.route.model, requestHash);
    if (hit) {
      ctx.metrics.cacheHits.inc({ model: ctx.route.model });
      reply.header('X-Routed-Model', ctx.route.model);
      reply.header('X-Routed-Provider', ctx.route.provider);
      reply.header('X-Task-Type', ctx.taskType);
      reply.header('X-Cache', 'HIT');
      reply.header('X-Cache-Age-Ms', String(Math.max(0, Date.now() - hit.createdAt)));
      return reply.send(hit.response);
    }
    // Cache miss is counted in metrics; the lookup() call already
    // incremented the in-process counter, so we only need the
    // Prometheus sample here.
    ctx.metrics.cacheMisses.inc({ model: ctx.route.model });
    // Stash the hash on the context so the post-call store() can
    // avoid recomputing it.
    (ctx as RouteContext & { _cacheRequestHash?: string })._cacheRequestHash = requestHash;
  }

  const callOpts: ProviderCallOptions = { requestHeaders: { 'X-Request-Id': ctx.requestId } };
  const upstreamStartNs = process.hrtime.bigint();
  let upstreamOutcome: 'success' | 'error' | 'timeout' = 'success';
  try {
    const response = await provider.chatCompletion(request, callOpts);
    const latency = Date.now() - ctx.startTime;

    // Token accounting: feed the per-tenant daily counter with the
    // upstream-reported `usage` (authoritative for billing) and
    // surface a Prometheus sample for the dashboard. Falls back to
    // the pre-flight estimate when the upstream omits `usage`.
    if (ctx.tokenBudget && response.usage) {
      const estimate = (ctx as RouteContext & { _tokenEstimate?: { promptTokens: number }; _cacheRequestHash?: string })._tokenEstimate ?? {
        promptTokens: ctx.tokenBudget.estimate(request.messages, ctx.route.model),
      };
      ctx.tokenBudget.record(
        ctx.tenantId,
        ctx.route.model,
        {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
        },
        estimate,
      );
      ctx.metrics.tokensProcessed.inc(
        { tenant: ctx.tenantId, model: ctx.route.model, direction: 'prompt' },
        response.usage.prompt_tokens,
      );
      ctx.metrics.tokensProcessed.inc(
        { tenant: ctx.tenantId, model: ctx.route.model, direction: 'completion' },
        response.usage.completion_tokens,
      );
      const snap = ctx.tokenBudget.snapshot(ctx.tenantId);
      ctx.metrics.tenantDailyTokens.set(
        { tenant: ctx.tenantId },
        snap?.dailyTokens ?? 0,
      );
    }

    // Store the response in the cache for the next caller. Done
    // before the bookkeeping below so a cache-store failure does
    // not affect the response the user sees.
    if (ctx.cache) {
      const stash = (ctx as RouteContext & { _cacheRequestHash?: string })._cacheRequestHash;
      const hash = stash ?? computeRequestHash(ctx.route.model, request.messages, request);
      ctx.cache.store(ctx.route.model, hash, response, {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
      });
    }

    // 记录成本
    if (ctx.storage && response.usage) {
      const { costUsd } = recordCostFromUsage(
        ctx.storage,
        ctx.config,
        response.usage,
        ctx.route.provider,
        ctx.route.model,
        ctx.taskType,
      );
        await recordTenantSpend(ctx.tenantTracker, ctx.metrics, ctx.tenantId, costUsd);
    }

    // 记录路由日志
    if (ctx.storage) {
      ctx.storage.recordRouteLog(
        ctx.taskType,
        ctx.originalModel,
        ctx.route.model,
        ctx.route.provider,
        latency,
        true,
      );
    }

    // 记录性能
    ctx.routeEngine.recordPerformance(
      ctx.route.provider,
      ctx.route.model,
      ctx.taskType,
      true,
      latency,
    );

    // 在响应中添加路由信息头
    reply.header('X-Routed-Model', ctx.route.model);
    reply.header('X-Routed-Provider', ctx.route.provider);
    reply.header('X-Task-Type', ctx.taskType);
    reply.header('X-Latency-Ms', latency.toString());
    reply.header('X-Cache', 'MISS');

    return reply.send(response);
  } catch (err) {
    upstreamOutcome = err instanceof UpstreamTimeoutError ? 'timeout' : 'error';
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - upstreamStartNs) / 1e9;
    ctx.metrics.upstreamDuration.observe(
      { provider: ctx.route.provider, model: ctx.route.model },
      seconds,
    );
    ctx.metrics.upstreamRequests.inc({
      provider: ctx.route.provider,
      model: ctx.route.model,
      outcome: upstreamOutcome,
    });
  }
}

/**
 * 处理流式请求 — 通过 SSE 转发上游流。
 *
 * 注意:调用本函数后,headers 立即被冲刷到客户端。任何后续错误都无法再
 * 改变状态码,只能通过 SSE `event: error` 事件向客户端传递失败信息。
 * 这一点被 handleErrorFallback 显式处理。
 */
async function handleStreaming(
  provider: BaseProvider,
  request: ChatCompletionRequest,
  reply: FastifyReply,
  ctx: RouteContext,
): Promise<FastifyReply> {
  // 设置 SSE 响应头 — 此调用之后 reply.send() 不再可用。
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Routed-Model': ctx.route.model,
    'X-Routed-Provider': ctx.route.provider,
    'X-Task-Type': ctx.taskType,
  });

  const upstreamStartNs = process.hrtime.bigint();
  let upstreamOutcome: 'success' | 'error' | 'timeout' = 'success';

  try {
    const stream = provider.streamChatCompletion(request, {
      requestHeaders: { 'X-Request-Id': ctx.requestId },
    });
    let lastUsageEvent: SSEEvent | null = null;
    let completionText = '';
    const MAX_COMPLETION_TEXT_LENGTH = 100000; // 限制累积文本长度，防止内存溢出

    // 包装流以提取 usage 和文本内容
    async function* wrappedStream() {
      for await (const event of stream) {
        // 尝试提取文本内容用于估算 token
        try {
          const parsed = JSON.parse(event.data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta && completionText.length < MAX_COMPLETION_TEXT_LENGTH) {
            completionText += delta;
          }
          // 保留含 usage 的事件
          if (parsed.usage) {
            lastUsageEvent = event;
          }
        } catch {
          // 忽略解析错误
        }
        yield event;
      }
    }

    await forwardSSE(wrappedStream(), reply.raw);

    // 流结束后记录成本
    const latency = Date.now() - ctx.startTime;
    let usage: UsageInfo | null = null;

    // 优先从流中的 usage 事件提取
    if (lastUsageEvent) {
      usage = extractTokenUsageFromSSE([lastUsageEvent]);
    }

    if (!usage) {
      // 估算 token 使用量
      const promptText = request.messages.map((m: ChatMessage) => m.content).join('');
      usage = estimateTokenUsage(promptText, completionText);
    }

    if (ctx.storage) {
      const { costUsd } = recordCostFromUsage(
        ctx.storage,
        ctx.config,
        usage,
        ctx.route.provider,
        ctx.route.model,
        ctx.taskType,
      );
        await recordTenantSpend(ctx.tenantTracker, ctx.metrics, ctx.tenantId, costUsd);
      ctx.storage.recordRouteLog(
        ctx.taskType,
        ctx.originalModel,
        ctx.route.model,
        ctx.route.provider,
        latency,
        true,
      );
    }

    // Token accounting for streaming responses. We don't pre-flight
    // the completion size (impossible), so the daily cap can be
    // exceeded by a long stream — that is an accepted trade-off in
    // exchange for keeping the streaming path low-latency. We do
    // update the per-tenant daily counter so the next request sees
    // the latest usage.
    if (ctx.tokenBudget) {
      const estimate = (ctx as RouteContext & { _tokenEstimate?: { promptTokens: number } })._tokenEstimate ?? {
        promptTokens: ctx.tokenBudget.estimate(request.messages, ctx.route.model),
      };
      ctx.tokenBudget.record(
        ctx.tenantId,
        ctx.route.model,
        { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens },
        estimate,
      );
      ctx.metrics.tokensProcessed.inc(
        { tenant: ctx.tenantId, model: ctx.route.model, direction: 'prompt' },
        usage.prompt_tokens,
      );
      ctx.metrics.tokensProcessed.inc(
        { tenant: ctx.tenantId, model: ctx.route.model, direction: 'completion' },
        usage.completion_tokens,
      );
      const snap = ctx.tokenBudget.snapshot(ctx.tenantId);
      ctx.metrics.tenantDailyTokens.set(
        { tenant: ctx.tenantId },
        snap?.dailyTokens ?? 0,
      );
    }

    ctx.routeEngine.recordPerformance(
      ctx.route.provider,
      ctx.route.model,
      ctx.taskType,
      true,
      latency,
    );

    // The reply object is already invalidated by writeHead; we return a sentinel.
    return reply;
  } catch (err) {
    upstreamOutcome = err instanceof UpstreamTimeoutError ? 'timeout' : 'error';
    throw err;
  } finally {
    const seconds = Number(process.hrtime.bigint() - upstreamStartNs) / 1e9;
    ctx.metrics.upstreamDuration.observe(
      { provider: ctx.route.provider, model: ctx.route.model },
      seconds,
    );
    ctx.metrics.upstreamRequests.inc({
      provider: ctx.route.provider,
      model: ctx.route.model,
      outcome: upstreamOutcome,
    });
  }
}

/**
 * 错误回退处理:尝试使用次优路由重新执行请求。
 *
 * 关键约束:
 *  - 如果 reply.headers 已经被写出 (流式请求) → 不能返回 502,只能往 SSE
 *    流里写 `event: error` 然后关闭
 *  - 如果 reply.headers 还没被写出 (非流式) → 可以正常返回 502 JSON
 *  - 如果所有路由都失败 → 返回一个分类的最终错误 (502 for upstream, 500
 *    if no fallback was found)
 *
 * 这个函数永不抛错(它本身就是 catch 块的处理器),只返回 FastifyReply。
 */
async function handleErrorFallback(
  error: unknown,
  registry: ProviderRegistry,
  primaryProvider: BaseProvider,
  routedRequest: ChatCompletionRequest,
  reply: FastifyReply,
  request: FastifyRequest,
  ctx: RouteContext,
): Promise<FastifyReply> {
  const latency = Date.now() - ctx.startTime;
  const errMsg = error instanceof Error ? error.message : String(error);

  // 记录失败 (for the primary route)
  ctx.routeEngine.recordPerformance(
    ctx.route.provider,
    ctx.route.model,
    ctx.taskType,
    false,
    latency,
  );
  if (ctx.storage) {
    ctx.storage.recordRouteLog(
      ctx.taskType,
      ctx.originalModel,
      ctx.route.model,
      ctx.route.provider,
      latency,
      false,
    );
  }

  request.log.error(
    { error: errMsg, provider: ctx.route.provider, model: ctx.route.model },
    '请求失败',
  );

  // Try the next-best route. If the primary provider wasn't the one that
  // threw (e.g. provider lookup failed), the fallback may still succeed.
  const fallbackRoute = getNextRoute(ctx.routeEngine, ctx.taskType, ctx.route.model);
  if (fallbackRoute) {
    const fallbackProvider = registry.getProvider(fallbackRoute.provider);
    if (fallbackProvider && fallbackProvider !== primaryProvider) {
      request.log.info({ from: ctx.route.model, to: fallbackRoute.model }, '尝试回退路由');
      const fallbackRequest = { ...routedRequest, model: fallbackRoute.model };
      const fallbackCtx: RouteContext = {
        ...ctx,
        route: fallbackRoute,
      };
      try {
        if (routedRequest.stream) {
          // Stream mode: the new request will own its own SSE response.
          // We just delegate and let handleStreaming write the headers.
          // The previous primary error did NOT get to write headers (the
          // error happened before writeHead), so the client has not seen
          // any 200 yet — they only see this fallback's 200.
          return await handleStreaming(fallbackProvider, fallbackRequest, reply, fallbackCtx);
        } else {
          return await handleNonStreaming(fallbackProvider, fallbackRequest, reply, fallbackCtx);
        }
      } catch (fallbackError) {
        request.log.error({ error: fallbackError }, '回退路由也失败');
        // Fall through to the final 502/500 below.
      }
    }
  }

  // All routes failed. Decide based on whether the primary request was
  // streaming (headers already flushed) or not.
  if (routedRequest.stream) {
    // Headers were already written; the client expects SSE. Emit a single
    // error event and close the stream cleanly.
    try {
      reply.raw.write(
        `event: error\ndata: ${JSON.stringify({ error: { message: `模型请求失败: ${errMsg}`, type: 'upstream_error' } })}\n\n`,
      );
      reply.raw.end();
    } catch (writeErr) {
      request.log.error({ error: writeErr }, 'Failed to write SSE error after fallback exhaustion');
    }
    return reply;
  }

  // Non-stream: safe to send a status code.
  return reply.status(502).send({
    error: {
      message: `模型请求失败: ${errMsg}`,
      type: 'upstream_error',
    },
  });
}

/**
 * 从 UsageInfo 记录成本
 *
 * Pure helper — no closure capture over the proxy state. The
 * tenant cost circuit is fed by the caller (who has access to
 * the per-request `tenantId` and the per-server `tenantTracker`)
 * so the bookkeeping for the breaker and the storage layer
 * stays separate. See `recordTenantSpend` below for the caller
 * that bridges the two.
 */
function recordCostFromUsage(
  storage: Storage,
  config: AppConfig,
  usage: UsageInfo,
  provider: string,
  model: string,
  taskType: TaskType,
): { costUsd: number } {
  let costPer1kInput = 0;
  let costPer1kOutput = 0;

  // 优先从 Provider 配置的自定义定价中获取
  const providerConfig = config.providers[provider];
  if (providerConfig?.pricing?.[model]) {
    costPer1kInput = providerConfig.pricing[model].input;
    costPer1kOutput = providerConfig.pricing[model].output;
  } else {
    // 从路由引擎的模型配置中获取定价
    const modelConfig = MODEL_CONFIGS.find((m) => m.id === model);
    if (modelConfig) {
      costPer1kInput = modelConfig.cost_per_1k_input;
      costPer1kOutput = modelConfig.cost_per_1k_output;
    }
  }

  const costUsd =
    (usage.prompt_tokens / 1000) * costPer1kInput +
    (usage.completion_tokens / 1000) * costPer1kOutput;

  const record: CostRecord = {
    timestamp: Date.now(),
    provider,
    model,
    task_type: taskType,
    input_tokens: usage.prompt_tokens,
    output_tokens: usage.completion_tokens,
    cost_usd: costUsd,
  };

  storage.recordCost(record);
  return { costUsd };
}

/**
 * Bridge between the pure cost-recording helper and the
 * per-tenant breaker. Returns the recorded cost so the caller
 * can branch on it (e.g. log warnings, increment extra metrics).
 */
async function recordTenantSpend(
  tenantTracker: TenantCostTracker | RedisTenantCostTracker,
  metrics: MetricsBundle,
  tenantId: string,
  costUsd: number,
): Promise<void> {
  if (costUsd <= 0) return;
  await tenantTracker.record(tenantId, costUsd);
  const snap = await tenantTracker.snapshot(tenantId);
  metrics.tenantDailyCost.set({ tenant: tenantId }, snap?.dailyUsd ?? 0);
}

/**
 * 获取下一个回退路由
 *
 * 公开导出（仅用于单元测试）。生产代码路径通过 handleErrorFallback
 * 间接调用。
 */
export function getNextRoute(
  routeEngine: RouteEngine,
  taskType: TaskType,
  currentModel: string,
): { provider: string; model: string } | null {
  // 使用不同策略重试
  const strategies: ('cost' | 'quality' | 'balanced')[] = ['balanced', 'cost', 'quality'];
  for (const strategy of strategies) {
    const route = routeEngine.route(taskType, currentModel, strategy);
    if (route.model !== currentModel) {
      return route;
    }
  }
  return null;
}

/** Collect every tracked tenant into a JSON-friendly array. The
 *  internal `Map` is not exposed directly so the response shape
 *  stays stable across internal refactors. */
async function collectAllTenantSnapshots(tracker: TenantCostTracker | RedisTenantCostTracker) {
  return tracker.snapshotAll();
}

/**
 * 启动代理服务器
 */
export async function startProxyServer(
  config: AppConfig,
  storage?: Storage,
  registry?: ProviderRegistry,
  routeEngine?: RouteEngine,
): Promise<FastifyInstance> {
  const server = await createProxyServer({ config, storage, registry, routeEngine });
  const port = config.server.port;

  await server.listen({ port, host: '127.0.0.1' });
  server.log.info(`CodeShield 代理服务器已启动: http://127.0.0.1:${port}`);

  return server;
}
