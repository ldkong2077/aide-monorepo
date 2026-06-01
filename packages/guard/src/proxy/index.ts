/**
 * CodeShield - HTTP 代理服务器
 * 基于 Fastify 的 AI 模型代理，支持请求路由、流式转发和成本记录
 */

import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply, type FastifyError } from 'fastify';
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
} from '../types.js';
import { ProviderRegistry } from '../provider/index.js';
import { RouteEngine, MODEL_CONFIGS } from '../router/index.js';
import { forwardSSE, extractTokenUsageFromSSE, estimateTokenUsage } from './stream.js';
import type { Storage } from '../storage/index.js';
import { Verifier } from '../guard/verifier.js';

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
}

/**
 * 创建并配置代理服务器
 */
export async function createProxyServer(options: ProxyServerOptions): Promise<FastifyInstance> {
  const { config, storage } = options;

  const fastify = Fastify({
    bodyLimit: config.server.bodyLimit || 1048576, // 默认 1MB
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // 注册 CORS 插件
  await fastify.register(cors, {
    origin: ['http://localhost:9901', 'http://127.0.0.1:9901', 'http://localhost:9900', 'http://127.0.0.1:9900'],
  });

  // Bearer Token 认证（使用恒定时间比较防止时序攻击）
  if (config.server.token) {
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') return;
      const authHeader = request.headers.authorization;
      const expected = `Bearer ${config.server.token}`;
      if (!authHeader || !timingSafeEqual(authHeader, expected)) {
        reply.status(401).send({ error: { message: 'Unauthorized', type: 'auth_error' } });
      }
    });
  } else {
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
  const routeEngine = options.routeEngine || new RouteEngine({
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
    request.log.info(
      { method: request.method, url: request.url },
      '收到请求',
    );
  });

  // 错误处理
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: {
        message: error.message || '内部服务器错误',
        type: error.name || 'internal_error',
      },
    });
  });

  // ==================== 路由 ====================

  /**
   * POST /v1/chat/completions - 主要代理端点
   * 解析请求 → 分类任务 → 路由到 Provider → 转发响应
   */
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ChatCompletionRequest;
    if (!body || !body.messages || body.messages.length === 0) {
      return reply.status(400).send({
        error: { message: '缺少 messages 字段', type: 'invalid_request_error' },
      });
    }

    const startTime = Date.now();
    const originalModel = body.model;

    // 分类任务类型
    const taskType = routeEngine.classifyTask(body.messages);

    // 路由到最优模型
    const route = routeEngine.route(taskType, originalModel);

    // 获取 Provider
    const provider = registry.getProvider(route.provider);
    if (!provider) {
      return reply.status(502).send({
        error: {
          message: `Provider "${route.provider}" 不可用`,
          type: 'provider_error',
        },
      });
    }

    // 替换请求中的模型
    const routedRequest: ChatCompletionRequest = {
      ...body,
      model: route.model,
    };

    try {
      if (body.stream) {
        // ===== 流式请求 =====
        await handleStreamRequest(provider, routedRequest, reply, {
          originalModel,
          route,
          taskType,
          startTime,
          routeEngine,
          storage,
          config,
        });
      } else {
        // ===== 非流式请求 =====
        const response = await provider.chatCompletion(routedRequest);
        const latency = Date.now() - startTime;

        // 记录成本
        if (storage && response.usage) {
          recordCostFromUsage(storage, config, response.usage, route.provider, route.model, taskType);
        }

        // 记录路由日志
        if (storage) {
          storage.recordRouteLog(taskType, originalModel, route.model, route.provider, latency, true);
        }

        // 记录性能
        routeEngine.recordPerformance(route.provider, route.model, taskType, true, latency);

        // 在响应中添加路由信息头
        reply.header('X-Routed-Model', route.model);
        reply.header('X-Routed-Provider', route.provider);
        reply.header('X-Task-Type', taskType);
        reply.header('X-Latency-Ms', latency.toString());

        return reply.send(response);
      }
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : String(error);

      // 记录失败
      routeEngine.recordPerformance(route.provider, route.model, taskType, false, latency);
      if (storage) {
        storage.recordRouteLog(taskType, originalModel, route.model, route.provider, latency, false);
      }

      request.log.error({ error: errMsg, provider: route.provider, model: route.model }, '请求失败');

      // 尝试回退到下一个路由
      const fallbackRoute = getNextRoute(routeEngine, taskType, route.model);
      if (fallbackRoute) {
        const fallbackProvider = registry.getProvider(fallbackRoute.provider);
        if (fallbackProvider) {
          request.log.info(
            { from: route.model, to: fallbackRoute.model },
            '尝试回退路由',
          );
          const fallbackRequest = { ...routedRequest, model: fallbackRoute.model };
          try {
            if (body.stream) {
              await handleStreamRequest(fallbackProvider, fallbackRequest, reply, {
                originalModel,
                route: fallbackRoute,
                taskType,
                startTime,
                routeEngine,
                storage,
                config,
              });
            } else {
              const fallbackResponse = await fallbackProvider.chatCompletion(fallbackRequest);
              const fallbackLatency = Date.now() - startTime;
              routeEngine.recordPerformance(fallbackRoute.provider, fallbackRoute.model, taskType, true, fallbackLatency);
              reply.header('X-Routed-Model', fallbackRoute.model);
              reply.header('X-Routed-Provider', fallbackRoute.provider);
              reply.header('X-Fallback', 'true');
              return reply.send(fallbackResponse);
            }
          } catch (fallbackError) {
            request.log.error({ error: fallbackError }, '回退路由也失败');
          }
        }
      }

      return reply.status(502).send({
        error: {
          message: `模型请求失败: ${errMsg}`,
          type: 'upstream_error',
        },
      });
    }
  });

  /**
   * POST /v1/models - 列出可用模型
   */
  fastify.get('/v1/models', async () => {
    const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
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
   * GET /health - 健康检查
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
        error: { message: 'CodeGuard 未启用，请在配置中设置 guard.enabled = true', type: 'guard_disabled' },
      });
    }

    const verifier = new Verifier(storage);

    try {
      // 如果提供了代码片段，直接进行幻觉检测
      if (body.code && body.language) {
        const { HallucinationDetector } = await import('../guard/hallucination.js');
        const detector = new HallucinationDetector(storage);
        const hallucinations = detector.detect(body.code, body.language as import('../types.js').Language, process.cwd());

        const report: VerificationReport = {
          id: `cg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          timestamp: Date.now(),
          options: { format: 'json' },
          files_checked: ['inline-code'],
          diffResults: [],
          hallucinations,
          testResult: undefined,
          confidence: {
            overall: hallucinations.length === 0 ? 100 : Math.max(0, 100 - hallucinations.length * 15),
            verdict: hallucinations.length === 0 ? 'TRUST' : hallucinations.some(h => h.severity === 'high' || h.severity === 'critical') ? 'REJECT' : 'REVIEW',
            dimensions: {
              diffSafety: 100,
              hallucinationFree: hallucinations.length === 0 ? 100 : Math.max(0, 100 - hallucinations.length * 20),
              testPassRate: 100,
              typeCheck: 100,
            },
            riskFactors: hallucinations.map(h => h.message),
          },
          summary: hallucinations.length === 0
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
  fastify.post('/v1/guard/trusted-packages', async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

  return fastify;
}

// ==================== 辅助函数 ====================

/** 流式请求处理参数 */
interface StreamHandlerContext {
  originalModel: string;
  route: { provider: string; model: string };
  taskType: TaskType;
  startTime: number;
  routeEngine: RouteEngine;
  storage?: Storage;
  config: AppConfig;
}

/**
 * 处理流式请求
 */
async function handleStreamRequest(
  provider: import('../provider/index.js').BaseProvider,
  request: ChatCompletionRequest,
  reply: FastifyReply,
  ctx: StreamHandlerContext,
): Promise<void> {
  // 设置 SSE 响应头
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Routed-Model': ctx.route.model,
    'X-Routed-Provider': ctx.route.provider,
    'X-Task-Type': ctx.taskType,
  });

  const stream = provider.streamChatCompletion(request);
  let lastUsageEvent: import('../types.js').SSEEvent | null = null;
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
    recordCostFromUsage(ctx.storage, ctx.config, usage, ctx.route.provider, ctx.route.model, ctx.taskType);
    ctx.storage.recordRouteLog(ctx.taskType, ctx.originalModel, ctx.route.model, ctx.route.provider, latency, true);
  }

  ctx.routeEngine.recordPerformance(ctx.route.provider, ctx.route.model, ctx.taskType, true, latency);
}

/**
 * 从 UsageInfo 记录成本
 */
function recordCostFromUsage(
  storage: Storage,
  config: AppConfig,
  usage: UsageInfo,
  provider: string,
  model: string,
  taskType: TaskType,
): void {
  let costPer1kInput = 0;
  let costPer1kOutput = 0;

  // 优先从 Provider 配置的自定义定价中获取
  const providerConfig = config.providers[provider];
  if (providerConfig?.pricing?.[model]) {
    costPer1kInput = providerConfig.pricing[model].input;
    costPer1kOutput = providerConfig.pricing[model].output;
  } else {
    // 从路由引擎的模型配置中获取定价
    const modelConfig = MODEL_CONFIGS.find(m => m.id === model);
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
}

/**
 * 获取下一个回退路由
 */
function getNextRoute(
  routeEngine: RouteEngine,
  taskType: TaskType,
  currentModel: string,
): { provider: string; model: string } | null {
  // 使用不同策略重试
  const strategies: Array<'cost' | 'quality' | 'balanced'> = ['balanced', 'cost', 'quality'];
  for (const strategy of strategies) {
    const route = routeEngine.route(taskType, currentModel, strategy);
    if (route.model !== currentModel) {
      return route;
    }
  }
  return null;
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
