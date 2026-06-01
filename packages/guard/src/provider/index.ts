/**
 * CodeShield - Provider 抽象层
 * 统一管理 OpenAI/DeepSeek/Ollama（OpenAI兼容）和 Anthropic 的 API 调用
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  UsageInfo,
  Choice,
  ProviderConfig,
  SSEEvent,
} from '../types.js';

// ==================== 重试工具 ====================

/** 重试选项 */
interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * 带指数退避的重试执行器
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 不重试的错误类型：认证失败、请求格式错误
      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          opts.maxDelayMs,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * 判断是否为不应重试的错误
 */
function isNonRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('invalid api key') ||
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid_request') ||
    msg.includes('context_length_exceeded')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== Base Provider ====================

/** Provider 抽象基类 */
export abstract class BaseProvider {
  readonly name: string;
  readonly config: ProviderConfig;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = config;
  }

  /** 非流式 Chat Completion */
  abstract chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /** 流式 Chat Completion，返回 async generator */
  abstract streamChatCompletion(
    req: ChatCompletionRequest,
  ): AsyncGenerator<SSEEvent, void, undefined>;

  /** 验证配置是否有效 */
  abstract validateConfig(): boolean;

  /** 获取可用模型列表 */
  getModels(): string[] {
    return this.config.models;
  }

  /** 健康检查：验证 API 连通性 */
  abstract healthCheck(): Promise<boolean>;
}

// ==================== OpenAI 兼容 Provider ====================

/** OpenAI兼容Provider（支持 OpenAI、DeepSeek、Ollama 等） */
export class OpenAICompatibleProvider extends BaseProvider {
  private client: OpenAI;

  constructor(name: string, config: ProviderConfig) {
    super(name, config);
    if (!config.apiKey) {
      throw new Error(`API key is required for ${config.name || 'provider'}. Set the appropriate environment variable.`);
    }
    const apiKey = config.apiKey;
    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
    });
  }

  validateConfig(): boolean {
    return !!(this.config.apiKey && this.config.baseUrl);
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: req.model,
        messages: req.messages as OpenAI.ChatCompletionMessageParam[],
        stream: false,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        top_p: req.top_p,
        frequency_penalty: req.frequency_penalty,
        presence_penalty: req.presence_penalty,
        stop: req.stop,
        n: req.n,
      });

      return this.convertResponse(response);
    });
  }

  async *streamChatCompletion(
    req: ChatCompletionRequest,
  ): AsyncGenerator<SSEEvent, void, undefined> {
    const stream = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages as OpenAI.ChatCompletionMessageParam[],
      stream: true,
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      top_p: req.top_p,
      frequency_penalty: req.frequency_penalty,
      presence_penalty: req.presence_penalty,
      stop: req.stop,
    });

    for await (const chunk of stream) {
      const data = JSON.stringify(chunk);
      yield { data };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /** 转换 OpenAI SDK 响应为统一格式 */
  private convertResponse(
    response: OpenAI.ChatCompletion,
  ): ChatCompletionResponse {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      choices: response.choices.map((c): Choice => ({
        index: c.index,
        message: {
          role: c.message.role as ChatMessage['role'],
          content: c.message.content || '',
          tool_calls: c.message.tool_calls as ChatMessage['tool_calls'],
        },
        finish_reason: c.finish_reason || '',
      })),
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}

// ==================== Anthropic Provider ====================

/** Anthropic Provider（Claude 模型） */
export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(name: string, config: ProviderConfig) {
    super(name, config);
    if (!config.apiKey) {
      throw new Error(`API key is required for ${config.name || 'provider'}. Set the appropriate environment variable.`);
    }
    const apiKey = config.apiKey;
    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseUrl !== 'https://api.anthropic.com' ? config.baseUrl : undefined,
    });
  }

  validateConfig(): boolean {
    return !!this.config.apiKey;
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    return withRetry(async () => {
      // 提取 system 消息
      const systemMessage = req.messages.find((m) => m.role === 'system')?.content || '';
      const nonSystemMessages = req.messages.filter((m) => m.role !== 'system');

      // 转换消息格式
      const anthropicMessages = nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      const response = await this.client.messages.create({
        model: req.model,
        max_tokens: req.max_tokens || 4096,
        system: systemMessage || undefined,
        messages: anthropicMessages,
        temperature: req.temperature,
        top_p: req.top_p,
        stream: false,
      });

      return this.convertAnthropicResponse(response, req.model);
    });
  }

  async *streamChatCompletion(
    req: ChatCompletionRequest,
  ): AsyncGenerator<SSEEvent, void, undefined> {
    const systemMessage = req.messages.find((m) => m.role === 'system')?.content || '';
    const nonSystemMessages = req.messages.filter((m) => m.role !== 'system');

    const anthropicMessages = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    }));

    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.max_tokens || 4096,
      system: systemMessage || undefined,
      messages: anthropicMessages,
      temperature: req.temperature,
      top_p: req.top_p,
    });

    for await (const event of stream) {
      // 将 Anthropic 事件转换为统一 SSE 格式
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield {
            event: 'content_block_delta',
            data: JSON.stringify({
              id: event.type,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: req.model,
              choices: [
                {
                  index: 0,
                  delta: { content: delta.text },
                  finish_reason: null,
                },
              ],
            }),
          };
        } else if (delta.type === 'input_json_delta') {
          // tool_use 的 JSON 输入增量
          yield {
            event: 'content_block_delta',
            data: JSON.stringify({
              id: event.type,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: req.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: 0,
                      function: { arguments: delta.partial_json },
                    }],
                  },
                  finish_reason: null,
                },
              ],
            }),
          };
        }
      } else if (event.type === 'content_block_start') {
        // tool_use 块开始
        const contentBlock = (event as { content_block?: { type: string; id?: string; name?: string } }).content_block;
        if (contentBlock?.type === 'tool_use') {
          yield {
            event: 'content_block_start',
            data: JSON.stringify({
              id: event.type,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: req.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: 0,
                      id: contentBlock.id,
                      type: 'function',
                      function: { name: contentBlock.name, arguments: '' },
                    }],
                  },
                  finish_reason: null,
                },
              ],
            }),
          };
        }
      } else if (event.type === 'message_stop') {
        yield {
          event: 'message_stop',
          data: JSON.stringify({
            id: event.type,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: req.model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          }),
        };
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // 发送一个最小请求来验证 API 连通性
      await this.client.messages.create({
        model: this.config.models[0] || 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      // 认证错误说明 key 有效但可能有限制，仍算连通
      const msg = error instanceof Error ? error.message.toLowerCase() : '';
      if (msg.includes('invalid api key') || msg.includes('authentication')) {
        return false;
      }
      // 其他错误（如速率限制、超出预算）说明 API 可达
      return true;
    }
  }

  /** 转换 Anthropic 响应为 OpenAI 兼容格式 */
  private convertAnthropicResponse(
    response: Anthropic.Message,
    model: string,
  ): ChatCompletionResponse {
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const usage: UsageInfo = {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: response.stop_reason || 'stop',
        },
      ],
      usage,
    };
  }
}

// ==================== Provider 注册表 ====================

/** Provider 注册表，管理所有 Provider 实例 */
export class ProviderRegistry {
  private providers: Map<string, BaseProvider> = new Map();

  /** 注册一个 Provider */
  registerProvider(name: string, config: ProviderConfig): BaseProvider {
    const provider = this.createProvider(name, config);
    this.providers.set(name, provider);
    return provider;
  }

  /** 获取已注册的 Provider */
  getProvider(name: string): BaseProvider | undefined {
    return this.providers.get(name);
  }

  /** 获取所有已注册的 Provider 名称 */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /** 获取所有已注册的 Provider */
  getAllProviders(): Map<string, BaseProvider> {
    return new Map(this.providers);
  }

  /** 健康检查：验证指定 Provider 的 API 连通性 */
  async pingProvider(name: string): Promise<boolean> {
    const provider = this.providers.get(name);
    if (!provider) return false;
    try {
      return await provider.healthCheck();
    } catch {
      return false;
    }
  }

  /** 批量健康检查所有 Provider */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    const checks = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        results[name] = await provider.healthCheck();
      } catch {
        results[name] = false;
      }
    });
    await Promise.all(checks);
    return results;
  }

  /** 根据 Provider 名称创建对应的 Provider 实例 */
  private createProvider(name: string, config: ProviderConfig): BaseProvider {
    const lowerName = name.toLowerCase();
    if (lowerName === 'anthropic' || lowerName === 'claude') {
      return new AnthropicProvider(name, config);
    }
    // OpenAI、DeepSeek、Ollama 等均使用 OpenAI 兼容接口
    return new OpenAICompatibleProvider(name, config);
  }
}
