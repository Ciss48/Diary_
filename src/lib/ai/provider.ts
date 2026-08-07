/**
 * Calls the configured AI provider (server-side only).
 * Reads env vars at call-time so they are never bundled to the client.
 * No SDK — plain fetch.
 */

interface ProviderError extends Error {
  status?: number;
}

async function callGroq(
  systemPrompt: string,
  userContent: string,
  includeResponseFormat: boolean,
  modelOverride?: string,
): Promise<string> {
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
  };
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
    const err: ProviderError = new Error(`Provider HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected provider response shape');
  }
  return content;
}

/**
 * Calls the configured AI provider with a system + user message.
 * Throws an Error (with optional .status) on HTTP error or timeout.
 *
 * For Groq: if the model returns HTTP 400 (likely response_format not
 * supported), retries once without response_format and logs the event.
 */
export async function callAI(
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const provider = process.env.AI_PROVIDER;

  if (provider !== 'groq') {
    throw new Error('Unsupported AI_PROVIDER: ' + (provider ?? '(unset)'));
  }

  try {
    return await callGroq(systemPrompt, userContent, true);
  } catch (err) {
    const providerErr = err as ProviderError;
    if (providerErr.status === 400) {
      // Model does not support response_format — retry without it.
      // Moderate discovery: model ignores json_object constraint; parseSuggestion
      // handles the fallout defensively.
      console.error(
        '[ai/provider] response_format not supported by model; retrying without it.',
      );
      return await callGroq(systemPrompt, userContent, false);
    }
    throw err;
  }
}

/**
 * Calls the AI provider using the small model (AI_MODEL_SMALL env var).
 * Falls back to AI_MODEL if AI_MODEL_SMALL is unset.
 * Same retry-on-400 logic as callAI.
 */
export async function callAISmall(
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const provider = process.env.AI_PROVIDER;

  if (provider !== 'groq') {
    throw new Error('Unsupported AI_PROVIDER: ' + (provider ?? '(unset)'));
  }

  const smallModel = process.env.AI_MODEL_SMALL || process.env.AI_MODEL;

  try {
    return await callGroq(systemPrompt, userContent, true, smallModel);
  } catch (err) {
    const providerErr = err as ProviderError;
    if (providerErr.status === 400) {
      console.error(
        '[ai/provider] response_format not supported by small model; retrying without it.',
      );
      return await callGroq(systemPrompt, userContent, false, smallModel);
    }
    throw err;
  }
}
