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

export const GEMINI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com';
export const GEMINI_DEFAULT_MODEL_ID = 'gemini-2.5-flash';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const GEMINI_API_VERSION = 'v1beta';

export const GEMINI_PROVIDER_DEFINITION = {
  vendorKey: 'gemini',
  displayName: 'Google Gemini',
  providerType: 'text',
  providerClass: 'remote_text',
  protocol: 'gemini-generate-content',
  adapterKey: 'gemini',
  defaultEndpoint: GEMINI_DEFAULT_ENDPOINT,
  defaultModelId: GEMINI_DEFAULT_MODEL_ID,
  auth: {
    envVar: 'GEMINI_API_KEY',
    vaultKeyNamespace: 'gemini',
    header: {
      name: 'x-goog-api-key',
      scheme: 'raw',
    },
    required: true,
    purpose: 'api_key',
  },
  capabilities: {
    streaming: true,
    nativeToolUse: false,
    modelListing: false,
  },
  isLocal: false,
} as const satisfies ProviderDefinitionLeaf;

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role?: 'user' | 'model';
  parts?: GeminiPart[];
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiFormattedInput {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
}

export class GeminiProvider implements IModelProvider {
  private readonly config: ModelProviderConfig;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    config: ModelProviderConfig,
    options?: { apiKey?: string; timeoutMs?: number },
  ) {
    this.config = config;
    this.endpoint = config.endpoint ?? GEMINI_DEFAULT_ENDPOINT;
    this.apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new NousError(
        'Gemini API key required — set GEMINI_API_KEY or pass apiKey option',
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
    const formatted = this.toGeminiFormat(input);
    const response = await this.fetchWithTimeout(this.getUrl('generateContent'), {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted)),
    });

    await this.throwForResponseError(response);

    const data = (await response.json()) as GeminiGenerateResponse;

    return {
      output: this.extractText(data),
      providerId: this.config.id,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        computeMs: undefined,
      },
      traceId: request.traceId,
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const input = this.validateInput(request.input);
    const formatted = this.toGeminiFormat(input);
    const response = await this.fetchWithTimeout(`${this.getUrl('streamGenerateContent')}?alt=sse`, {
      method: 'POST',
      headers: this.getHeaders(),
      signal: request.abortSignal,
      body: JSON.stringify(this.buildRequestBody(formatted)),
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
    let yieldedDone = false;

    try {
      while (true) {
        const { done, value } = await this.readStreamChunk(reader, request.abortSignal);
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';

        for (const eventChunk of events) {
          const event = this.parseStreamEvent(eventChunk);
          if (!event) continue;

          inputTokens = event.usageMetadata?.promptTokenCount ?? inputTokens;
          outputTokens = event.usageMetadata?.candidatesTokenCount ?? outputTokens;

          const content = this.extractText(event);
          const doneFlag = event.candidates?.some((candidate) => candidate.finishReason) ?? false;
          yieldedDone = yieldedDone || doneFlag;

          if (content || doneFlag) {
            yield {
              content,
              done: doneFlag,
              usage: doneFlag ? { inputTokens, outputTokens } : undefined,
            };
          }
        }
      }

      if (buffer.trim()) {
        const event = this.parseStreamEvent(buffer);
        if (event) {
          inputTokens = event.usageMetadata?.promptTokenCount ?? inputTokens;
          outputTokens = event.usageMetadata?.candidatesTokenCount ?? outputTokens;
          const content = this.extractText(event);
          const doneFlag = event.candidates?.some((candidate) => candidate.finishReason) ?? false;
          yieldedDone = yieldedDone || doneFlag;

          if (content || doneFlag) {
            yield {
              content,
              done: doneFlag,
              usage: doneFlag ? { inputTokens, outputTokens } : undefined,
            };
          }
        }
      }

      if (!yieldedDone) {
        yield {
          content: '',
          done: true,
          usage: { inputTokens, outputTokens },
        };
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

  private toGeminiFormat(input: TextModelInput): GeminiFormattedInput {
    const contents: GeminiContent[] = [];
    const systemParts: GeminiPart[] = [];

    if ('messages' in input && Array.isArray(input.messages)) {
      for (const message of input.messages) {
        const text = this.messageContentToText(message.content);
        if (message.role === 'system') {
          if (text) systemParts.push({ text });
          continue;
        }

        contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text }],
        });
      }
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: 'prompt' in input ? input.prompt : '' }],
      });
    }

    if (input.systemSegments && input.systemSegments.length > 0) {
      systemParts.splice(
        0,
        systemParts.length,
        ...input.systemSegments.map((text) => ({ text })),
      );
    }

    return {
      contents,
      ...(systemParts.length > 0 ? { systemInstruction: { parts: systemParts } } : {}),
    };
  }

  private messageContentToText(content: unknown): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }

  private buildRequestBody(formatted: GeminiFormattedInput): Record<string, unknown> {
    return {
      contents: formatted.contents,
      ...(formatted.systemInstruction ? { systemInstruction: formatted.systemInstruction } : {}),
      generationConfig: {
        maxOutputTokens: this.config.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      },
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
  }

  private getUrl(method: 'generateContent' | 'streamGenerateContent'): string {
    const apiRoot = this.getApiRoot();
    return `${apiRoot}/models/${this.normalizeModelId(this.config.modelId)}:${method}`;
  }

  private getApiRoot(): string {
    const root = this.endpoint.replace(/\/$/, '');
    return root.endsWith(`/${GEMINI_API_VERSION}`) ? root : `${root}/${GEMINI_API_VERSION}`;
  }

  private normalizeModelId(modelId: string): string {
    return modelId.replace(/^models\//, '');
  }

  private extractText(response: GeminiGenerateResponse): string {
    return response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('') ?? '';
  }

  private async throwForResponseError(response: Response): Promise<void> {
    if (response.status === 401 || response.status === 403) {
      throw new NousError(
        'Gemini API key invalid or missing',
        'PROVIDER_AUTH_FAILED',
        { failoverReasonCode: 'PRV-AUTH-FAILURE' },
      );
    }

    if (response.status === 404) {
      throw new NousError(
        `Gemini model not found: ${this.config.modelId}`,
        'MODEL_NOT_FOUND',
        { failoverReasonCode: 'PRV-MODEL-NOT-FOUND' },
      );
    }

    if (response.status === 429) {
      throw new NousError(
        `Gemini rate limit: ${response.status}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-RATE-LIMIT' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new NousError(
        `Gemini API error ${response.status}: ${text.slice(0, 200)}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    }
  }

  private parseStreamEvent(eventChunk: string): GeminiGenerateResponse | null {
    const dataLines = eventChunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('\n');
    if (!payload || payload === '[DONE]') {
      return null;
    }

    return JSON.parse(payload) as GeminiGenerateResponse;
  }

  private async readStreamChunk(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortSignal?: AbortSignal,
  ): ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']> {
    if (abortSignal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new NousError('Gemini request aborted.', 'ABORTED');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    const boundedRead = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new NousError(
          `Gemini stream read timed out after ${this.timeoutMs}ms`,
          'PROVIDER_UNAVAILABLE',
          { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
        ));
        void reader.cancel(new DOMException('provider_timeout', 'AbortError'))
          .catch(() => undefined);
      }, this.timeoutMs);

      if (abortSignal) {
        abortHandler = () => {
          reject(new NousError('Gemini request aborted.', 'ABORTED'));
          void reader.cancel().catch(() => undefined);
        };
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
    });

    try {
      return await Promise.race([
        reader.read(),
        boundedRead,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abortSignal && abortHandler) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
    }
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
      return await fetch(url, {
        ...init,
        signal,
      });
    } catch (error) {
      if (timeoutController.signal.aborted) {
        throw new NousError(
          `Gemini request timed out after ${this.timeoutMs}ms`,
          'PROVIDER_UNAVAILABLE',
          { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
        );
      }

      if ((error as Error).name === 'AbortError') {
        throw new NousError('Gemini request aborted.', 'ABORTED');
      }

      throw new NousError(
        `Gemini endpoint unreachable: ${(error as Error).message}`,
        'PROVIDER_UNAVAILABLE',
        { failoverReasonCode: 'PRV-PROVIDER-UNAVAILABLE' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
