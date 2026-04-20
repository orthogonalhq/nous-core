import { NousError, ValidationError } from '@nous/shared';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from '@nous/shared';
import { TextModelInputSchema, type TextModelInput } from './schemas.js';

const DEFAULT_ENDPOINT = 'https://api.anthropic.com';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 4096;
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string; name?: string; input?: unknown; thinking?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

interface AnthropicStreamEvent {
  type?: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: {
    type?: string;
    text?: string;
    usage?: { output_tokens?: number };
  };
  usage?: { output_tokens?: number };
  content_block?: { type?: string; text?: string };
}

interface AnthropicFormattedInput {
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools?: Array<Record<string, unknown>>;
}

export class AnthropicProvider implements IModelProvider {
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
    this.apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new NousError(
        'Anthropic API key required — set ANTHROPIC_API_KEY or pass apiKey option',
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
    const formatted = this.toAnthropicFormat(input);
    const response = await this.fetchWithTimeout(this.getUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted, false)),
    });

    await this.throwForResponseError(response);

    const data = (await response.json()) as AnthropicMessageResponse;

    // When response contains only text blocks (no tool_use, no thinking),
    // return plain string for backward compatibility.
    // When response contains structured blocks, return the full response object
    // so the adapter can parse tool_use, thinking, etc.
    const hasStructuredBlocks = data.content?.some(
      (part) => part.type === 'tool_use' || part.type === 'thinking',
    );

    const output = hasStructuredBlocks
      ? { content: data.content, stop_reason: data.stop_reason }
      : (data.content?.find((part) => part.type === 'text' || part.text != null)?.text ?? '');

    return {
      output,
      providerId: this.config.id,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
        computeMs: undefined,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const formatted = this.toAnthropicFormat(input);
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

          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
            continue;
          }

          if (event.type === 'content_block_delta') {
            const content = event.delta?.text ?? event.content_block?.text ?? '';
            if (content) {
              yield { content, done: false };
            }
            continue;
          }

          if (event.type === 'message_delta') {
            outputTokens =
              event.usage?.output_tokens
              ?? event.delta?.usage?.output_tokens
              ?? outputTokens;

            yield {
              content: '',
              done: true,
              usage: {
                inputTokens,
                outputTokens,
              },
            };
          }
        }
      }

      if (buffer.trim()) {
        const event = this.parseStreamEvent(buffer);
        if (event?.type === 'message_delta') {
          outputTokens =
            event.usage?.output_tokens
            ?? event.delta?.usage?.output_tokens
            ?? outputTokens;

          yield {
            content: '',
            done: true,
            usage: {
              inputTokens,
              outputTokens,
            },
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

  private toAnthropicFormat(input: TextModelInput): AnthropicFormattedInput {
    const result: AnthropicFormattedInput = { messages: [] };

    // Pass through tools if present
    if (input.tools && input.tools.length > 0) {
      result.tools = input.tools;
    }

    if ('messages' in input && Array.isArray(input.messages)) {
      const systemMessages = input.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content);
      result.messages = input.messages
        .filter(
          (message): message is { role: 'user' | 'assistant'; content: string } =>
            message.role === 'user' || message.role === 'assistant',
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      // systemSegments override single system string when present
      if (input.systemSegments && input.systemSegments.length > 0) {
        result.system = input.systemSegments.map((segment, index) => ({
          type: 'text' as const,
          text: segment,
          ...(index === input.systemSegments!.length - 1
            ? { cache_control: { type: 'ephemeral' as const } }
            : {}),
        }));
      } else {
        result.system = systemMessages.length > 0 ? systemMessages.join('\n') : undefined;
      }

      return result;
    }

    // systemSegments for prompt-style input
    if (input.systemSegments && input.systemSegments.length > 0) {
      result.system = input.systemSegments.map((segment, index) => ({
        type: 'text' as const,
        text: segment,
        ...(index === input.systemSegments!.length - 1
          ? { cache_control: { type: 'ephemeral' as const } }
          : {}),
      }));
    }

    result.messages = [
      {
        role: 'user',
        content: 'prompt' in input ? input.prompt : '',
      },
    ];

    return result;
  }

  private buildRequestBody(
    formatted: AnthropicFormattedInput,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: this.config.modelId,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: formatted.messages,
      ...(formatted.system ? { system: formatted.system } : {}),
      ...(formatted.tools && formatted.tools.length > 0 ? { tools: formatted.tools } : {}),
      stream,
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
  }

  private getUrl(): string {
    return `${this.endpoint.replace(/\/$/, '')}/v1/messages`;
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
        `Anthropic rate limit: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `Anthropic API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }
  }

  private parseStreamEvent(eventChunk: string): AnthropicStreamEvent | null {
    const lines = eventChunk.split(/\r?\n/);
    let eventType: string | undefined;
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      }

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

    const event = JSON.parse(payload) as AnthropicStreamEvent;
    if (!event.type && eventType) {
      event.type = eventType;
    }

    return event;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutController = new AbortController();
    // SP 1.16 RC-β.2 / β3 — symmetric to Ollama β1: abort with a DOMException
    // (name: 'AbortError') so the catch block classifies timeout aborts via
    // either the hoisted signal check OR the name check, never falling
    // through to the generic "endpoint unreachable" branch.
    const timeout = setTimeout(
      () => timeoutController.abort(new DOMException('provider_timeout', 'AbortError')),
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
    } catch (error) {
      // SP 1.16 RC-β.2 / β3 — hoist signal-aborted check above name check.
      if (timeoutController.signal.aborted) {
        throw new NousError(
          `Anthropic request timed out after ${this.timeoutMs}ms`,
          'PROVIDER_UNAVAILABLE',
          { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
        );
      }
      if ((error as Error).name === 'AbortError') {
        throw new NousError('Anthropic request aborted.', 'ABORTED');
      }

      throw new NousError(
        `Anthropic endpoint unreachable: ${(error as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
