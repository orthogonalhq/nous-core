/**
 * Mistral AI provider — Chat Completions wire protocol.
 *
 * Mistral's API is OpenAI Chat Completions-compatible. This leaf owns its own
 * request execution rather than delegating to src/protocols/openai-api because
 * it uses Mistral-specific auth, endpoint, default model, and capabilities.
 *
 * Do not copy Anthropic-specific semantics (cache_control, extended thinking,
 * Anthropic version headers) — they do not apply here.
 */
import { NousError, ValidationError } from '@nous/shared';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from '@nous/shared';
import type { ProviderDefinitionLeaf } from '../../schemas/provider-definition.js';
import { TextModelInputSchema, type TextModelInput } from '../../schemas/text-model-input.js';

const DEFAULT_ENDPOINT = 'https://api.mistral.ai';
const DEFAULT_MODEL_ID = 'mistral-large-latest';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;

export const MISTRAL_PROVIDER_DEFINITION = {
  vendorKey: 'mistral',
  displayName: 'Mistral',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'chat-completions',
  adapterKey: 'mistral',
  defaultEndpoint: DEFAULT_ENDPOINT,
  defaultModelId: DEFAULT_MODEL_ID,
  auth: {
    envVar: 'MISTRAL_API_KEY',
    vaultKeyNamespace: 'mistral',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  modelListEndpoint: '/v1/models',
  modelListFormat: 'openai-models',
  capabilities: {
    streaming: true,
    cacheControl: false,
    extendedThinking: false,
    modelListing: true,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

interface MistralChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface MistralChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: MistralToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface MistralStreamDelta {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface MistralFormattedMessages {
  messages: MistralChatMessage[];
}

export class MistralProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    config: ModelProviderConfig,
    options?: { apiKey?: string; timeoutMs?: number },
  ) {
    this.config = config;
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.apiKey = options?.apiKey ?? process.env.MISTRAL_API_KEY ?? '';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new NousError(
        'Mistral API key required — set MISTRAL_API_KEY or pass apiKey option',
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
    const formatted = this.toMistralMessages(input);
    const response = await this.fetchWithTimeout(this.getChatUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted, false)),
    });

    await this.throwForResponseError(response);

    const data = (await response.json()) as MistralChatResponse;
    const message = data.choices?.[0]?.message;
    const hasToolCalls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
    const output = hasToolCalls ? { choices: data.choices } : (message?.content ?? '');

    return {
      output,
      providerId: this.config.id,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        computeMs: undefined,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const formatted = this.toMistralMessages(input);
    const response = await this.fetchWithTimeout(this.getChatUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted, true)),
    });

    await this.throwForResponseError(response);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new NousError('No response body', 'PROVIDER_UNAVAILABLE');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trimStart();
          if (!payload || payload === '[DONE]') continue;

          const chunk = JSON.parse(payload) as MistralStreamDelta;

          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          }

          const choice = chunk.choices?.[0];
          const content = choice?.delta?.content;
          const finishReason = choice?.finish_reason;

          if (content) {
            yield { content, done: false };
          }

          if (finishReason === 'stop' || finishReason === 'length' || finishReason === 'tool_calls') {
            yield {
              content: '',
              done: true,
              usage: { inputTokens, outputTokens },
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private validateInput(input: unknown): TextModelInput {
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

  private toMistralMessages(input: TextModelInput): MistralFormattedMessages {
    const messages: MistralChatMessage[] = [];

    if ('messages' in input && Array.isArray(input.messages)) {
      for (const msg of input.messages) {
        if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
        }
      }
      return { messages };
    }

    if ('prompt' in input) {
      messages.push({ role: 'user', content: input.prompt });
    }

    return { messages };
  }

  private buildRequestBody(
    formatted: MistralFormattedMessages,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: this.config.modelId,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: formatted.messages,
      stream,
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private getChatUrl(): string {
    return `${this.endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '')}/v1/chat/completions`;
  }

  private async throwForResponseError(response: Response): Promise<void> {
    if (response.status === 401 || response.status === 403) {
      throw new NousError(
        'Mistral API key invalid or missing',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    if (response.status === 429) {
      throw new NousError(
        `Mistral rate limit exceeded: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `Mistral API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(new DOMException('provider_timeout', 'AbortError')),
      this.timeoutMs,
    );
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      return await fetch(url, { ...init, signal });
    } catch (error) {
      if (timeoutController.signal.aborted) {
        throw new NousError(
          `Mistral request timed out after ${this.timeoutMs}ms`,
          'PROVIDER_UNAVAILABLE',
          { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
        );
      }
      if ((error as Error).name === 'AbortError') {
        throw new NousError('Mistral request aborted.', 'ABORTED');
      }
      throw new NousError(
        `Mistral endpoint unreachable: ${(error as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

