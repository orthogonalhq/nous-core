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

const DEFAULT_ENDPOINT = 'https://api.cohere.com';
const DEFAULT_MODEL_ID = 'command-a-03-2025';
const DEFAULT_TIMEOUT_MS = 60_000;

export const COHERE_PROVIDER_DEFINITION = {
  vendorKey: 'cohere',
  displayName: 'Cohere',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'cohere-chat',
  adapterKey: 'cohere',
  defaultEndpoint: DEFAULT_ENDPOINT,
  defaultModelId: DEFAULT_MODEL_ID,
  auth: {
    envVar: 'COHERE_API_KEY',
    vaultKeyNamespace: 'cohere',
    header: {
      name: 'Authorization',
      scheme: 'bearer',
    },
    required: true,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
    cacheControl: false,
    extendedThinking: false,
    nativeToolUse: true,
    modelListing: false,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

interface CohereContentBlock {
  type?: string;
  text?: string;
}

interface CohereToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface CohereChatResponse {
  message?: {
    role?: string;
    content?: CohereContentBlock[];
    tool_calls?: CohereToolCall[];
  };
  finish_reason?: string;
  usage?: {
    billed_units?: { input_tokens?: number; output_tokens?: number };
  };
}

interface CohereStreamEvent {
  type?: string;
  delta?: {
    message?: {
      content?: { text?: string };
      tool_calls?: { function?: { name?: string; arguments?: string } };
    };
    finish_reason?: string;
    usage?: { billed_units?: { input_tokens?: number; output_tokens?: number } };
  };
}

interface CohereFormattedInput {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tools?: Array<Record<string, unknown>>;
}

export class CohereProvider implements IModelProvider {
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
    this.apiKey = options?.apiKey ?? process.env.COHERE_API_KEY ?? '';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new NousError(
        'Cohere API key required — set COHERE_API_KEY or pass apiKey option',
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
    const formatted = this.toCohereFormat(input);
    const response = await this.fetchWithTimeout(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted, false)),
    });

    await this.throwForResponseError(response);

    const data = (await response.json()) as CohereChatResponse;

    const hasToolCalls = (data.message?.tool_calls?.length ?? 0) > 0;
    const output = hasToolCalls
      ? { message: data.message, finish_reason: data.finish_reason }
      : (data.message?.content?.find((part) => part.type === 'text')?.text ?? '');

    return {
      output,
      providerId: this.config.id,
      usage: {
        inputTokens: data.usage?.billed_units?.input_tokens,
        outputTokens: data.usage?.billed_units?.output_tokens,
        computeMs: undefined,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const formatted = this.toCohereFormat(input);
    const response = await this.fetchWithTimeout(this.getUrl(), {
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
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';

        for (const eventChunk of events) {
          const event = this.parseStreamEvent(eventChunk);
          if (!event) continue;

          if (event.type === 'content-delta') {
            const content = event.delta?.message?.content?.text ?? '';
            if (content) {
              yield { content, done: false };
            }
            continue;
          }

          if (event.type === 'message-end') {
            outputTokens = event.delta?.usage?.billed_units?.output_tokens ?? outputTokens;
            inputTokens = event.delta?.usage?.billed_units?.input_tokens ?? inputTokens;

            yield {
              content: '',
              done: true,
              usage: { inputTokens, outputTokens },
            };
          }
        }
      }

      if (buffer.trim()) {
        const event = this.parseStreamEvent(buffer);
        if (event?.type === 'message-end') {
          outputTokens = event.delta?.usage?.billed_units?.output_tokens ?? outputTokens;
          inputTokens = event.delta?.usage?.billed_units?.input_tokens ?? inputTokens;

          yield {
            content: '',
            done: true,
            usage: { inputTokens, outputTokens },
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private validateInput(input: unknown): TextModelInput {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map((error) => ({
        path: error.path.join('.'),
        message: error.message,
      }));
      throw new ValidationError('Invalid model input', errors);
    }
    return result.data;
  }

  private toCohereFormat(input: TextModelInput): CohereFormattedInput {
    const result: CohereFormattedInput = { messages: [] };

    if (input.tools && input.tools.length > 0) {
      result.tools = input.tools;
    }

    if ('messages' in input && Array.isArray(input.messages)) {
      result.messages = input.messages
        .filter(
          (message): message is { role: 'user' | 'assistant' | 'system'; content: string } =>
            message.role === 'user' || message.role === 'assistant' || message.role === 'system',
        )
        .map((message) => ({ role: message.role, content: message.content }));

      if (input.systemSegments && input.systemSegments.length > 0) {
        result.messages = [
          { role: 'system', content: input.systemSegments.join('\n') },
          ...result.messages,
        ];
      }

      return result;
    }

    if (input.systemSegments && input.systemSegments.length > 0) {
      result.messages.push({ role: 'system', content: input.systemSegments.join('\n') });
    }

    result.messages.push({
      role: 'user',
      content: 'prompt' in input ? input.prompt : '',
    });

    return result;
  }

  private buildRequestBody(
    formatted: CohereFormattedInput,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: this.config.modelId,
      messages: formatted.messages,
      ...(formatted.tools && formatted.tools.length > 0 ? { tools: formatted.tools } : {}),
      stream,
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private getUrl(): string {
    return `${this.endpoint.replace(/\/$/, '')}/v2/chat`;
  }

  private async throwForResponseError(response: Response): Promise<void> {
    if (response.status === 401 || response.status === 403) {
      throw new NousError(
        'API key invalid or missing',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    if (response.status === 429) {
      throw new NousError(
        `Cohere rate limit: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `Cohere API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }
  }

  private parseStreamEvent(eventChunk: string): CohereStreamEvent | null {
    const lines = eventChunk.split(/\r?\n/);
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('\n');
    if (!payload || payload === '[DONE]') {
      return null;
    }

    return JSON.parse(payload) as CohereStreamEvent;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
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
          `Cohere request timed out after ${this.timeoutMs}ms`,
          'PROVIDER_UNAVAILABLE',
          { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
        );
      }
      if ((error as Error).name === 'AbortError') {
        throw new NousError('Cohere request aborted.', 'ABORTED');
      }

      throw new NousError(
        `Cohere endpoint unreachable: ${(error as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
