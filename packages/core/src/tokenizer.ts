/**
 * AIDE Core - Token counting
 *
 * Thin wrapper around `gpt-tokenizer` (a pure-JS BPE tokenizer for
 * OpenAI models). Used by the Guard proxy to:
 *   - pre-flight the estimated prompt token count against per-request
 *     and per-tenant token budgets
 *   - measure completion text for streaming responses where the
 *     provider did not emit a `usage` chunk
 *
 * The default encoding is `o200k_base` (GPT-4o / GPT-5 family). The
 * `cl100k_base` encoding is loaded lazily on first use for older
 * models. Both encoders are memoised for the process lifetime — the
 * data tables are 2 MB each, so a per-call instantiation is wasteful.
 *
 * Why not just use the provider's reported `usage`?
 *  - Streaming responses often omit `usage` to save bandwidth.
 *  - We want to ENFORCE a budget BEFORE calling upstream, not after.
 *  - A local estimate is enough for budget decisions; we still treat
 *    the upstream's reported number as authoritative for billing.
 */
import { default as o200kBase } from 'gpt-tokenizer/encoding/o200k_base';
import { default as cl100kBase } from 'gpt-tokenizer/encoding/cl100k_base';
import type { ChatMessage } from './types.js';

/** Encoding families we know how to tokenize. */
export type TokenizerEncoding = 'o200k_base' | 'cl100k_base';

/** Default encoding when we can't recognise the model. o200k_base
 *  is the modern OpenAI default (GPT-4o / GPT-5 / o-series). */
export const DEFAULT_ENCODING: TokenizerEncoding = 'o200k_base';

/** Per-message overhead added by the OpenAI chat-template format.
 *  Source: OpenAI cookbook / `tiktoken` README — accounts for the
 *  `<|im_start|>role\n...<|im_end|>\n` wrapping. */
const CHAT_TEMPLATE_OVERHEAD_PER_MESSAGE = 3;
/** One extra token for the assistant primer when generating. */
const CHAT_TEMPLATE_OVERHEAD_REPLY = 1;

/** Pick an encoding based on the model name. Falls back to o200k_base. */
export function encodingForModel(model: string | undefined | null): TokenizerEncoding {
  if (!model) return DEFAULT_ENCODING;
  const m = model.toLowerCase();
  // o200k_base family: GPT-4o+, GPT-5, o-series.
  if (
    m.includes('gpt-4o') ||
    m.includes('gpt-5') ||
    m.includes('o1') ||
    m.includes('o3') ||
    m.includes('o4') ||
    m.includes('gpt-4.1') ||
    m.includes('gpt-4.5') ||
    m.includes('chatgpt-4o')
  ) {
    return 'o200k_base';
  }
  // cl100k_base family: GPT-4 / GPT-3.5 / text-embedding-3-*.
  return 'cl100k_base';
}

/** Resolve the actual encoder instance for an encoding name. The
 *  encoders are imported eagerly at module load but only the requested
 *  one is touched on each call, so the per-call cost is just a switch. */
function getEncoder(encoding: TokenizerEncoding): typeof o200kBase {
  return encoding === 'cl100k_base' ? cl100kBase : o200kBase;
}

/** Count the tokens in a raw string. */
export function countTokens(text: string, model?: string): number {
  if (text.length === 0) return 0;
  const enc = encodingForModel(model);
  return getEncoder(enc).countTokens(text);
}

/**
 * Count the tokens in a chat conversation. Applies the OpenAI
 * chat-template overhead per message (3 tokens each) and a single
 * reply primer (1 token) to mirror how providers compute usage.
 *
 * The `ChatMessage.content` field is typed as `string` in `@aide/core`,
 * but defensively stringify non-string content (null, array, object)
 * to keep the function tolerant of future type changes and provider
 * extensions (vision blocks, tool results, etc.).
 */
export function countMessageTokens(
  messages: readonly ChatMessage[],
  model?: string,
): number {
  if (messages.length === 0) return 0;
  const enc = encodingForModel(model);
  const encoder = getEncoder(enc);
  let total = 0;
  for (const message of messages) {
    total += CHAT_TEMPLATE_OVERHEAD_PER_MESSAGE;
    const content = message.content;
    if (typeof content === 'string') {
      total += encoder.countTokens(content);
    } else {
      // Tolerate null / undefined / array / object — encode the
      // JSON representation as a best-effort fallback.
      total += encoder.countTokens(JSON.stringify(content ?? ''));
    }
  }
  total += CHAT_TEMPLATE_OVERHEAD_REPLY;
  return total;
}

/**
 * Estimate the prompt-token count of a chat-completion request.
 * Combines message tokens with the model parameter (`name`) and the
 * `max_tokens` cap (each digit + name contributes a handful of tokens).
 *
 * The estimate is intentionally conservative: budget enforcement
 * should err on the side of REJECTING too aggressively rather than
 * letting an over-budget request slip through and cost the user real
 * money.
 */
export function estimateRequestTokens(
  messages: readonly ChatMessage[],
  model: string,
  options?: { maxTokens?: number },
): number {
  let total = countMessageTokens(messages, model);
  // The `name` field on the model is a single token; account for it
  // if the caller passed one via the messages.
  total += 1; // model name token (rough)
  if (options?.maxTokens !== undefined) {
    // Each digit in the number costs ~1 token. Conservative.
    total += String(options.maxTokens).length + 1;
  }
  return total;
}

/** Quick check: does the text fit within `limit` tokens? Useful
 *  for the `Request Entity Too Large` path where we want to fail
 *  fast without computing the exact count. */
export function isWithinTokenLimit(
  text: string,
  limit: number,
  model?: string,
): boolean {
  if (text.length === 0) return true;
  const enc = encodingForModel(model);
  // gpt-tokenizer's isWithinTokenLimit returns `false | number`;
  // we just need the boolean.
  return getEncoder(enc).isWithinTokenLimit(text, limit) !== false;
}
