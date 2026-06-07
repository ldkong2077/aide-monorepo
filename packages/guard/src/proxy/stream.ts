/**
 * CodeShield - SSE 流处理
 * 处理 OpenAI 和 Anthropic 两种 SSE 格式的解析与转发
 */

import type { SSEEvent, UsageInfo } from "../types.js";

/**
 * 解析 SSE 流，返回 async generator
 * 支持 OpenAI 格式: data: {...}\n\n
 * 支持 Anthropic 格式: event: type\ndata: {...}\n\n
 */
export async function* parseSSEStream(
  source: AsyncGenerator<SSEEvent, void, undefined> | AsyncIterable<SSEEvent>,
): AsyncGenerator<SSEEvent, void, undefined> {
  for await (const event of source) {
    yield event;
  }
}

/**
 * 从上游读取器解析 SSE 文本流
 * 适用于原始 HTTP 响应流的 SSE 解析
 */
export async function* parseRawSSEStream(
  reader: AsyncIterable<Uint8Array>,
  decoder?: InstanceType<typeof TextDecoder>,
): AsyncGenerator<SSEEvent, void, undefined> {
  const textDecoder = decoder || new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  for await (const chunk of reader) {
    buffer += textDecoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    // 保留最后一行（可能不完整）
    buffer = lines.pop() || "";

    let eventData = "";

    for (const line of lines) {
      const trimmed = line.trim();

      // 空行表示事件结束
      if (trimmed === "") {
        if (eventData) {
          yield {
            event: currentEvent || undefined,
            data: eventData,
          };
          eventData = "";
          currentEvent = "";
        }
        continue;
      }

      // event: 类型行
      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }

      // data: 数据行
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice(5).trim();
        // OpenAI 结束标记
        if (data === "[DONE]") {
          return;
        }
        eventData = eventData ? eventData + "\n" + data : data;
        continue;
      }

      // id: 和 retry: 行，忽略
      if (trimmed.startsWith("id:") || trimmed.startsWith("retry:")) {
        continue;
      }
    }
  }

  // 处理缓冲区中剩余内容
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data:")) {
      const data = trimmed.slice(5).trim();
      if (data && data !== "[DONE]") {
        yield {
          event: currentEvent || undefined,
          data,
        };
      }
    }
  }
}

/**
 * 将 SSE 事件转发到 Fastify 响应
 * 统一输出为 OpenAI SSE 格式
 */
export async function forwardSSE(
  source: AsyncGenerator<SSEEvent, void, undefined>,
  writable: NodeJS.WritableStream,
): Promise<void> {
  writable.write(""); // 触发 headers 发送

  try {
    for await (const event of source) {
      // 写入 event 类型（如果有）
      if (event.event) {
        writable.write(`event: ${event.event}\n`);
      }
      // 写入数据
      writable.write(`data: ${event.data}\n\n`);
    }
    // 发送结束标记
    writable.write("data: [DONE]\n\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // 发送错误事件
    writable.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  }
}

/**
 * 从 SSE 流的最后一个事件中提取 token 使用信息
 * OpenAI 格式在最后一个 chunk 中包含 usage 字段
 */
export function extractTokenUsageFromSSE(events: SSEEvent[]): UsageInfo | null {
  // 从后往前查找包含 usage 的数据
  for (let i = events.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(events[i].data);
      if (parsed.usage) {
        return {
          prompt_tokens: parsed.usage.prompt_tokens || 0,
          completion_tokens: parsed.usage.completion_tokens || 0,
          total_tokens: parsed.usage.total_tokens || 0,
        };
      }
    } catch {
      // 解析失败，继续查找
    }
  }
  return null;
}

/**
 * 从 Anthropic SSE 事件中提取 token 使用信息
 */
export function extractTokenUsageFromAnthropicSSE(
  events: SSEEvent[],
): UsageInfo | null {
  for (let i = events.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(events[i].data);
      // Anthropic message_start 或 message_delta 事件包含 usage
      if (parsed.type === "message_start" && parsed.message?.usage) {
        const usage = parsed.message.usage;
        return {
          prompt_tokens: usage.input_tokens || 0,
          completion_tokens: usage.output_tokens || 0,
          total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        };
      }
      if (parsed.type === "message_delta" && parsed.usage) {
        const usage = parsed.usage;
        return {
          prompt_tokens: 0,
          completion_tokens: usage.output_tokens || 0,
          total_tokens: usage.output_tokens || 0,
        };
      }
    } catch {
      // 解析失败，继续查找
    }
  }
  return null;
}

/**
 * 收集 SSE 事件并估算 token 使用量
 * 当流中没有 usage 信息时，通过文本长度估算
 */
export function estimateTokenUsage(
  promptText: string,
  completionText: string,
): UsageInfo {
  // 粗略估算：英文约4字符/token，中文约2字符/token
  const estimateTokens = (text: string): number => {
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 2 + otherChars / 4);
  };

  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(completionText);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}
