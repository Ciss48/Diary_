/**
 * Calls the configured AI provider (server-side only).
 * Reads env vars at call-time so they are never bundled to the client.
 * No SDK — plain fetch.
 */

export interface ProviderError extends Error {
  status?: number;
  code?: string;
  /** Seconds the provider asked us to wait, from the retry-after header. */
  retryAfter?: number;
}

/**
 * Models that emit chain-of-thought before their answer. Without a capped
 * reasoning effort they spend the whole completion budget thinking and return
 * an EMPTY content string (finish_reason "length"), which looks like a parse
 * failure further up. See memory/discoveries.md.
 */
const REASONING_MODEL = /gpt-oss|qwen|deepseek-r1/i;

/**
 * Groq bills the rate limiter for the *reserved* budget, not the tokens the
 * model actually spends: a request with max_completion_tokens=5000 books ~5000
 * TPM even when the answer is 50 tokens. On the on_demand tier (8000 TPM) that
 * makes two short lookups in a minute impossible. Small calls must therefore
 * ask for a small budget. See memory/discoveries.md.
 */
interface CallOptions {
  /** Model id; falls back to AI_MODEL. */
  model?: string;
  /** Completion budget. Also the amount of TPM this request reserves. */
  maxTokens?: number;
  /** Send response_format: json_object. */
  includeResponseFormat?: boolean;
}

async function callGroq(
  systemPrompt: string,
  userContent: string,
  opts: CallOptions,
): Promise<string> {
  const { model: modelOverride, maxTokens, includeResponseFormat = true } = opts;
  const apiKey = process.env.AI_API_KEY;
  const model = modelOverride ?? process.env.AI_MODEL;

  if (!apiKey || !model) {
    throw new Error('AI_API_KEY or AI_MODEL env var is missing');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    // The provider default (3072) truncates a full-length entry mid-JSON.
    // Keep input + this budget under the account's tokens-per-minute ceiling,
    // or the provider rejects the request outright with HTTP 413.
    max_completion_tokens: maxTokens ?? Number(process.env.AI_MAX_TOKENS || 5000),
  };
  if (REASONING_MODEL.test(model)) {
    body.reasoning_effort = process.env.AI_REASONING_EFFORT || 'low';
  }
  if (includeResponseFormat) {
    body.response_format = { type: 'json_object' };
  }

  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Surface the provider's own reason — "Provider HTTP 400" alone is not
    // enough to tell json_validate_failed apart from an unsupported parameter.
    const detail = await res.text().catch(() => '');
    let code: string | undefined;
    let message = detail.slice(0, 200);
    try {
      const parsed = JSON.parse(detail) as { error?: { code?: string; message?: string } };
      code = parsed.error?.code;
      message = parsed.error?.message?.slice(0, 200) ?? message;
    } catch {
      // non-JSON error body — keep the raw snippet
    }
    const err: ProviderError = new Error(
      `Provider HTTP ${res.status}${code ? ` (${code})` : ''}: ${message}`,
    );
    err.status = res.status;
    err.code = code;
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfter = retryAfter;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected provider response shape');
  }
  if (content.trim() === '') {
    // A reasoning model that ran out of budget returns "" with no error.
    throw new Error(
      `Provider returned empty content (model=${model}, finish_reason=${choice?.finish_reason ?? 'unknown'})`,
    );
  }
  return content;
}

/**
 * A short lookup only needs a few dozen tokens. Reserving more just burns the
 * TPM ceiling and makes the *next* click fail.
 */
export const smallMaxTokens = () => Number(process.env.AI_MAX_TOKENS_SMALL || 700);

/**
 * Longest retry-after we are willing to sit on. A small request that trips the
 * limit gets a short cooldown and is worth waiting out inside the same request;
 * a full-entry request gets ~18s, which the user would experience as a hang.
 */
const MAX_RETRY_WAIT_SECONDS = 8;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One Groq call plus the two recoveries that are worth attempting in-band:
 *  - HTTP 400 that is not json_validate_failed → the model rejected
 *    response_format; retry once without it.
 *  - HTTP 429 with a short retry-after → wait it out and retry once. Without
 *    this a second lookup inside the same minute surfaces as a hard failure.
 */
async function callGroqResilient(
  systemPrompt: string,
  userContent: string,
  opts: CallOptions,
  label: string,
): Promise<string> {
  const provider = process.env.AI_PROVIDER;
  if (provider !== 'groq') {
    throw new Error('Unsupported AI_PROVIDER: ' + (provider ?? '(unset)'));
  }

  let retriedFormat = false;
  let retriedRateLimit = false;

  for (;;) {
    try {
      return await callGroq(systemPrompt, userContent, opts);
    } catch (err) {
      const providerErr = err as ProviderError;

      if (
        providerErr.status === 400 &&
        providerErr.code !== 'json_validate_failed' &&
        !retriedFormat
      ) {
        // Model does not support response_format — retry without it.
        // parseSuggestion / parseLookupResponse handle unconstrained output.
        retriedFormat = true;
        console.error(
          `[ai/provider] response_format not supported by ${label}; retrying without it.`,
        );
        opts = { ...opts, includeResponseFormat: false };
        continue;
      }

      if (providerErr.status === 429 && !retriedRateLimit) {
        const wait = providerErr.retryAfter ?? 0;
        if (wait > 0 && wait <= MAX_RETRY_WAIT_SECONDS) {
          retriedRateLimit = true;
          console.error(
            `[ai/provider] rate limited on ${label}; waiting ${wait}s then retrying once.`,
          );
          await sleep(wait * 1000 + 250);
          continue;
        }
      }

      // json_validate_failed means response_format WAS accepted and the model
      // still failed to produce valid JSON. Dropping the constraint does not
      // help — it only spends a second call to get unparseable text back.
      throw err;
    }
  }
}

/**
 * Calls the configured AI provider with a system + user message.
 * Throws a ProviderError (with .status / .retryAfter) on HTTP error or timeout.
 */
export async function callAI(
  systemPrompt: string,
  userContent: string,
  options: { maxTokens?: number } = {},
): Promise<string> {
  return callGroqResilient(
    systemPrompt,
    userContent,
    { maxTokens: options.maxTokens },
    'model',
  );
}

/**
 * Calls the AI provider using the small model (AI_MODEL_SMALL env var).
 * Falls back to AI_MODEL if AI_MODEL_SMALL is unset.
 *
 * Defaults to a small completion budget: these calls translate or define a few
 * words, and an oversized budget is what starves the TPM ceiling.
 */
export async function callAISmall(
  systemPrompt: string,
  userContent: string,
  options: { maxTokens?: number } = {},
): Promise<string> {
  return callGroqResilient(
    systemPrompt,
    userContent,
    {
      model: process.env.AI_MODEL_SMALL || process.env.AI_MODEL,
      maxTokens: options.maxTokens ?? smallMaxTokens(),
    },
    'small model',
  );
}
