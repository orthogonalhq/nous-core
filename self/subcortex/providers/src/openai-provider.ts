/**
 * OpenAiCompatibleProvider — IModelProvider for OpenAI-compatible APIs.
 *
 * Uses /v1/chat/completions. API key from constructor or OPENAI_API_KEY env.
 * Endpoint from config or OPENAI_API_BASE env or https://api.openai.com.
 */
import { NousError, ValidationError } from '@nous/shared';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from '@nous/shared';
import { TextModelInputSchema } from './schemas.js';

const DEFAULT_ENDPOINT = 'https://api.openai.com';
const DEFAULT_TIMEOUT_MS = 60_000;

export class OpenAiCompatibleProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    config: ModelProviderConfig,
    options?: { apiKey?: string; timeoutMs?: number },
  ) {
    this.config = config;
    this.endpoint =
      config.endpoint ??
      process.env.OPENAI_API_BASE ??
      DEFAULT_ENDPOINT;
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new NousError(
        'OpenAI API key required — set OPENAI_API_KEY or pass apiKey option',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const input = this.validateInput(request.input);
    const messages = this.toOpenAiMessages(input);

    const url = `${this.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: request.abortSignal,
      body: JSON.stringify({
        model: this.config.modelId,
        messages,
        stream: false,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (response.status === 401) {
      throw new NousError(
        'API key invalid or missing',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    if (response.status === 429) {
      throw new NousError(
        `OpenAI rate limit: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `OpenAI API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }

    const data = (await response.json()) as OpenAiCompletionResponse;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';
    const usage = data.usage;

    return {
      output: content,
      providerId: this.config.id,
      usage: {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        computeMs: undefined,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const messages = this.toOpenAiMessages(input);

    const url = `${this.endpoint.replace(/\/$/, '')}/v1/chat/completions`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: request.abortSignal,
      body: JSON.stringify({
        model: this.config.modelId,
        messages,
        stream: true,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (response.status === 401) {
      throw new NousError(
        'API key invalid or missing',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    if (response.status === 429) {
      throw new NousError(
        `OpenAI rate limit: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `OpenAI API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new NousError('No response body', 'PROVIDER_UNAVAILABLE');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let usage: ModelStreamChunk['usage'];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim() || line === 'data: [DONE]') continue;
          if (line.startsWith('data: ')) {
            const json = line.slice(6);
            const data = JSON.parse(json) as OpenAiStreamChunk;
            const content = data.choices?.[0]?.delta?.content ?? '';

            if (data.usage) {
              usage = {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens,
              };
            }

            const doneFlag = data.choices?.[0]?.finish_reason === 'stop';

            yield {
              content,
              done: doneFlag,
              usage: doneFlag ? usage : undefined,
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private validateInput(input: unknown): { prompt?: string; messages?: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] }> } {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid model input', errors);
    }
    return result.data;
  }

  private toOpenAiMessages(
    input: { prompt?: string; messages?: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] }> },
  ): Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }> {
    if (input.messages && input.messages.length > 0) {
      return input.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      }));
    }
    return [{ role: 'user' as const, content: input.prompt ?? '' }];
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort('provider_timeout'),
      this.timeoutMs,
    );
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      return await fetch(url, {
        ...init,
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (timeoutController.signal.aborted) {
          throw new NousError(
            `OpenAI request timed out after ${this.timeoutMs}ms`,
            'PROVIDER_UNAVAILABLE',
            { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
          );
        }
        throw new NousError('OpenAI request aborted.', 'ABORTED');
      }
      throw new NousError(
        `OpenAI endpoint unreachable: ${(e as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface OpenAiCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
