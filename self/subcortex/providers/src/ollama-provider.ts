/**
 * OllamaProvider — IModelProvider implementation for local Ollama.
 *
 * Uses /api/generate for prompt and /api/chat for messages.
 * Default endpoint: http://localhost:11434
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

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 60_000;

export class OllamaProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(
    config: ModelProviderConfig,
    options?: { timeoutMs?: number },
  ) {
    this.config = config;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getConfig(): ModelProviderConfig {
    return this.config;
  }

  async invoke(request: ModelRequest): Promise<ModelResponse> {
    const input = this.validateInput(request.input);
    const start = Date.now();

    const body = this.buildRequestBody(input);
    const url = this.getUrl(body);
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.abortSignal,
      body: JSON.stringify({ ...body, stream: false }),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = (await response.json()) as OllamaGenerateResponse & OllamaChatResponse;
    const usage = this.extractUsage(data, start);

    // When tool_calls are present (done_reason: 'tool_calls' or message.tool_calls),
    // return the full message object so the adapter can extract structured tool calls.
    const chatMsg = data.message;
    const toolCallsArr = chatMsg?.tool_calls;
    const hasToolCalls =
      (Array.isArray(toolCallsArr) && toolCallsArr.length > 0) ||
      data.done_reason === 'tool_calls';

    const output = hasToolCalls && chatMsg
      ? chatMsg
      : data.response ?? chatMsg?.content ?? '';

    return {
      output,
      providerId: this.config.id,
      usage,
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const body = this.buildRequestBody(input);
    const url = this.getUrl(body);

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.abortSignal,
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      await this.handleError(response);
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
          if (!line.trim()) continue;
          const data = JSON.parse(line) as OllamaStreamChunk;
          const content = data.response ?? data.message?.content ?? '';

          if (data.done && data.eval_count != null) {
            usage = {
              outputTokens: data.eval_count,
              inputTokens: data.prompt_eval_count,
            };
          }

          yield {
            content,
            done: data.done ?? false,
            usage: data.done ? usage : undefined,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private validateInput(input: unknown): {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  } {
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

  private buildRequestBody(
    input: {
      prompt?: string;
      messages?: Array<{ role: string; content: string }>;
      tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    },
  ): Record<string, unknown> {
    const base: Record<string, unknown> = { model: this.config.modelId };
    if (input.prompt) {
      return { ...base, prompt: input.prompt };
    }
    const body: Record<string, unknown> = { ...base, messages: input.messages };

    // Pass tools to Ollama /api/chat in OpenAI-compatible format
    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    return body;
  }

  private getUrl(body: Record<string, unknown>): string {
    const hasMessages = Array.isArray(body.messages) && body.messages.length > 0;
    const path = hasMessages ? '/api/chat' : '/api/generate';
    return `${this.endpoint.replace(/\/$/, '')}${path}`;
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
      const response = await fetch(url, {
        ...init,
        signal,
      });
      return response;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (timeoutController.signal.aborted) {
          throw new NousError(
            `Ollama request timed out after ${this.timeoutMs}ms`,
            'PROVIDER_UNAVAILABLE',
            { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
          );
        }
        throw new NousError('Ollama request aborted.', 'ABORTED');
      }
      throw new NousError(
        `Ollama not available at ${this.endpoint}: ${(e as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleError(response: Response): Promise<never> {
    const text = await response.text();
    if (response.status === 404) {
      throw new NousError('Model not found', 'MODEL_NOT_FOUND', {
        failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE',
      });
    }
    throw new NousError(
      `Ollama error ${response.status}: ${text.slice(0, 200)}`,
      'PROVIDER_UNAVAILABLE',
      { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
    );
  }

  private extractUsage(
    data: OllamaGenerateResponse | OllamaChatResponse,
    start: number,
  ): ModelResponse['usage'] {
    const gen = data as OllamaGenerateResponse;
    const computeMs = Date.now() - start;
    return {
      inputTokens: gen.prompt_eval_count,
      outputTokens: gen.eval_count,
      computeMs,
    };
  }
}

interface OllamaGenerateResponse {
  response?: string;
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatResponse {
  message?: {
    content?: string;
    role?: string;
    tool_calls?: OllamaToolCall[];
    /** Thinking/reasoning content from models that support it (e.g. Gemma 4) */
    thinking?: string;
  };
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaStreamChunk {
  response?: string;
  message?: { content?: string };
  done?: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}
