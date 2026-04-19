/**
 * OllamaProvider — IModelProvider implementation for local Ollama.
 *
 * Uses /api/generate for prompt and /api/chat for messages.
 * Default endpoint: http://localhost:11434
 */
import { NousError, ValidationError } from '@nous/shared';
import type {
  IEventBus,
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  TraceId,
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

    // Return the full message object when available — preserves tool_calls,
    // thinking, and any other structured fields the adapter needs.
    // Fall back to plain string only for /api/generate responses (no message).
    const chatMsg = data.message;
    const output = chatMsg ?? data.response ?? '';

    console.debug('[nous:ollama-provider] invoke response shape', {
      url,
      hasMessage: !!chatMsg,
      messageKeys: chatMsg && typeof chatMsg === 'object' ? Object.keys(chatMsg) : 'n/a',
      hasThinking: chatMsg && typeof chatMsg === 'object' ? 'thinking' in chatMsg : false,
      hasResponse: !!data.response,
      outputType: typeof output,
      dataKeys: Object.keys(data),
    });

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

    // Per-stream-call <think> tag tracker. Allocated fresh inside the
    // generator body so each stream invocation gets independent state
    // (SDS Invariant I-4 — no cross-call state leakage).
    const thinkState: ThinkTagState = { insideThink: false, pendingPrefix: '' };

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
          const rawContent = data.response ?? data.message?.content ?? '';
          const nativeThinking = data.message?.thinking ?? data.thinking ?? '';

          // Apply <think> tag tracker. State carries across iterations so
          // tags split across SSE lines are correctly extracted.
          const { contentOut, thinkingOut } = applyThinkTagTracker(
            rawContent,
            thinkState,
            data.done ?? false,
          );

          if (data.done && data.eval_count != null) {
            usage = {
              outputTokens: data.eval_count,
              inputTokens: data.prompt_eval_count,
            };
          }

          const mergedThinking = (nativeThinking + thinkingOut) || undefined;
          yield {
            content: contentOut,
            thinking: mergedThinking,
            done: data.done ?? false,
            usage: data.done ? usage : undefined,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Optional `invokeWithThinkingStream` — drives `/api/chat` and accumulates
   * the response into the same shape `invoke()` returns (the full
   * `OllamaChatResponse.message` object including `content`, `thinking`, and
   * `tool_calls`). Publishes `chat:thinking-chunk` events on the event bus so
   * the UI can render thinking content while the gateway still receives the
   * full structured `ModelResponse` for tool-call extraction.
   *
   * Wire-mode honoring (SP 1.15 RC-2 — restores the cycle-1 SP 1.9 RC-2
   * invariant after SP 1.13 inadvertently regressed it):
   * - `body.stream` is honored via `body.stream ?? true`. Explicit `false`
   *   is preserved (the adapter sets `result.stream = false` when tools are
   *   present — see ollama-adapter.ts:319-322 — to keep tool-call extraction
   *   reliable). The cycle-1 SP 1.9 RC-2 invariant for non-tool-bearing
   *   turns (progressive thinking) is preserved by defaulting to streaming.
   *
   * Per-branch SSE emission (SDS Invariants I-10 + I-11):
   * - Streaming branch: N `chat:thinking-chunk` events, one per delta.
   * - Non-streaming branch: exactly 1 event with the full `thinking` field.
   * The downstream UI subscriber (ChatPanel.tsx:147-170) accepts both
   * cardinalities by accumulating into `streamingThinking` either way.
   *
   * Failure semantics: any thrown error (network, abort, malformed SSE,
   * schema validation, JSON parse) propagates so the gateway's
   * `invokeWithThinkingStreamFallback` catch path executes
   * `provider.invoke(request)` as the fallback.
   */
  async invokeWithThinkingStream(
    request: ModelRequest,
    eventBus: IEventBus,
    traceId: TraceId,
  ): Promise<ModelResponse> {
    const input = this.validateInput(request.input);
    const start = Date.now();
    const body = this.buildRequestBody(input);
    const url = this.getUrl(body);
    // SP 1.15 RC-2 — honor body.stream when set (explicit `false` from the
    // adapter is preserved); default to streaming when undefined. Use `??`
    // not `||` so `false` is treated as a valid explicit value.
    const effectiveStream = (body as { stream?: boolean }).stream ?? true;

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: request.abortSignal,
      body: JSON.stringify({ ...body, stream: effectiveStream }),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    if (effectiveStream) {
      return this.processStreamingThinkingResponse(response, eventBus, traceId, start, url, body, request.traceId);
    }
    return this.processNonStreamingThinkingResponse(response, eventBus, traceId, start, url, body, request.traceId);
  }

  private async processStreamingThinkingResponse(
    response: Response,
    eventBus: IEventBus,
    traceId: TraceId,
    start: number,
    url: string,
    _body: Record<string, unknown>,
    requestTraceId: TraceId,
  ): Promise<ModelResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new NousError('No response body', 'PROVIDER_UNAVAILABLE');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedThinking = '';
    let accumulatedToolCalls: OllamaToolCall[] | undefined;
    let accumulatedRole: string | undefined;
    let usage: ModelResponse['usage'] = { inputTokens: undefined, outputTokens: undefined };
    let chunkCount = 0;
    let hadToolCalls = false;
    let doneReason: string | undefined;

    // Per-call <think> tracker (SDS Invariant I-4 — fresh state).
    const thinkState: ThinkTagState = { insideThink: false, pendingPrefix: '' };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          chunkCount += 1;
          const data = JSON.parse(line) as OllamaStreamChunk;
          const rawContent = data.response ?? data.message?.content ?? '';
          const nativeThinking = data.message?.thinking ?? data.thinking ?? '';

          // Capture tool_calls / role / done_reason as the SSE stream
          // surfaces them. Tool calls usually arrive on the final chunk
          // for tool-bearing turns.
          if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
            accumulatedToolCalls = data.message.tool_calls;
            hadToolCalls = true;
          }
          if (data.message?.role && !accumulatedRole) {
            accumulatedRole = data.message.role;
          }
          if (data.done_reason) doneReason = data.done_reason;

          // Apply <think> tag tracker.
          const { contentOut, thinkingOut } = applyThinkTagTracker(
            rawContent,
            thinkState,
            data.done ?? false,
          );

          accumulatedContent += contentOut;
          const thinkingDelta = nativeThinking + thinkingOut;
          if (thinkingDelta.length > 0) {
            accumulatedThinking += thinkingDelta;
            // Publish each thinking delta progressively so the UI can render
            // it during the turn. Same channel and payload shape the
            // existing invokeWithStreaming path uses (agent-gateway.ts:545).
            try {
              eventBus.publish('chat:thinking-chunk', {
                content: thinkingDelta,
                traceId,
              });
            } catch { /* fire-and-forget */ }
          }

          if (data.done) {
            if (data.eval_count != null) {
              usage = {
                inputTokens: data.prompt_eval_count,
                outputTokens: data.eval_count,
                computeMs: Date.now() - start,
              };
            } else {
              usage = { ...usage, computeMs: Date.now() - start };
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Build a message object that matches OllamaChatResponse.message shape so
    // the gateway's adapter parseResponse path consumes it identically to
    // today's invoke() output.
    const messageObj: Record<string, unknown> = {};
    if (accumulatedRole) messageObj.role = accumulatedRole;
    messageObj.content = accumulatedContent;
    if (accumulatedThinking) messageObj.thinking = accumulatedThinking;
    if (accumulatedToolCalls && accumulatedToolCalls.length > 0) {
      messageObj.tool_calls = accumulatedToolCalls;
    }

    console.debug('[nous:ollama-provider] invokeWithThinkingStream complete', {
      url,
      accumulatedContentLength: accumulatedContent.length,
      accumulatedThinkingLength: accumulatedThinking.length,
      chunkCount,
      hadToolCalls,
      doneReason,
    });

    return {
      output: messageObj,
      providerId: this.config.id,
      usage,
      traceId: requestTraceId,
    };
  }

  private async processNonStreamingThinkingResponse(
    response: Response,
    eventBus: IEventBus,
    traceId: TraceId,
    start: number,
    url: string,
    _body: Record<string, unknown>,
    requestTraceId: TraceId,
  ): Promise<ModelResponse> {
    let data: OllamaChatResponse;
    try {
      data = (await response.json()) as OllamaChatResponse;
    } catch {
      throw new NousError('Invalid JSON in non-streaming response', 'PROVIDER_UNAVAILABLE');
    }

    const messageObj: Record<string, unknown> = {};
    if (data.message?.role) messageObj.role = data.message.role;
    messageObj.content = data.message?.content ?? '';
    if (data.message?.thinking) messageObj.thinking = data.message.thinking;
    if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
      messageObj.tool_calls = data.message.tool_calls;
    }

    // SDS Invariant I-11 — emit thinking as a single chat:thinking-chunk
    // event with the FULL thinking text. The UI's streamingThinking
    // accumulator at ChatPanel.tsx:147-170 populates in one frame.
    if (data.message?.thinking && data.message.thinking.length > 0) {
      try {
        eventBus.publish('chat:thinking-chunk', {
          content: data.message.thinking,
          traceId,
        });
      } catch { /* fire-and-forget — same posture as the streaming branch */ }
    }

    const usage: ModelResponse['usage'] = data.eval_count != null
      ? {
          inputTokens: data.prompt_eval_count,
          outputTokens: data.eval_count,
          computeMs: Date.now() - start,
        }
      : { computeMs: Date.now() - start };

    console.debug('[nous:ollama-provider] invokeWithThinkingStream complete (non-streaming branch)', {
      url,
      accumulatedContentLength: typeof messageObj.content === 'string' ? messageObj.content.length : 0,
      accumulatedThinkingLength: typeof messageObj.thinking === 'string' ? messageObj.thinking.length : 0,
      chunkCount: 1,
      hadToolCalls: !!(data.message?.tool_calls && data.message.tool_calls.length > 0),
      doneReason: data.done_reason,
    });

    return {
      output: messageObj,
      providerId: this.config.id,
      usage,
      traceId: requestTraceId,
    };
  }

  private validateInput(input: unknown): {
    prompt?: string;
    messages?: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] }>;
    tools?: Array<Record<string, unknown>>;
    stream?: boolean;
  } {
    const result = TextModelInputSchema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Invalid model input', errors);
    }
    return result.data as {
      prompt?: string;
      messages?: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] }>;
      tools?: Array<Record<string, unknown>>;
      stream?: boolean;
    };
  }

  private buildRequestBody(
    input: {
      prompt?: string;
      messages?: Array<{ role: string; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] }>;
      tools?: Array<Record<string, unknown>>;
      stream?: boolean;
    },
  ): Record<string, unknown> {
    const base: Record<string, unknown> = { model: this.config.modelId };
    if (input.prompt) {
      return { ...base, prompt: input.prompt };
    }
    const body: Record<string, unknown> = { ...base, messages: input.messages };

    // Pass tools to Ollama /api/chat in OpenAI-compatible format
    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((t: Record<string, unknown>) => {
        // Already in adapter format: { type: 'function', function: { ... } }
        if (t.type === 'function' && t.function) return t;
        // Legacy format: { name, description, input_schema }
        return {
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          },
        };
      });
    }

    // SP 1.15 RC-2 — propagate `stream` from the validated input so the
    // dispatcher's `body.stream ?? true` honoring works. The Ollama adapter
    // sets `result.stream = false` when tools are present (ollama-adapter.ts
    // GOTCHA setter); preserving that wire-mode signal end-to-end is the
    // contract requirement.
    if (typeof input.stream === 'boolean') {
      body.stream = input.stream;
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
  message?: {
    content?: string;
    /** Thinking/reasoning content from models that support it (e.g. Gemma 4 native) */
    thinking?: string;
    /** Tool calls — present on the final chunk for tool-bearing turns */
    tool_calls?: OllamaToolCall[];
    role?: string;
  };
  /** Defensive top-level thinking fallback for models that emit it outside `message` */
  thinking?: string;
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  prompt_eval_count?: number;
}

/** Per-`<think>`-tag-tracker state. Allocated fresh per stream invocation. */
interface ThinkTagState {
  insideThink: boolean;
  pendingPrefix: string;
}

/** Output of one tracker step. */
interface ThinkTagStepResult {
  contentOut: string;
  thinkingOut: string;
}

/**
 * Compute the length of the longest suffix of `text` that is a prefix of
 * `tag`. Used to buffer partial tag matches at the end of a chunk so the
 * next chunk can resolve them. Bounded by `tag.length - 1` to avoid
 * matching the full tag (which would have already been handled by indexOf).
 */
function longestSuffixThatIsPrefix(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len -= 1) {
    if (text.endsWith(tag.substring(0, len))) return len;
  }
  return 0;
}

/**
 * Apply the `<think>...</think>` tag tracker to one incoming raw-content
 * delta. Mutates `state` in place to carry across calls within a single
 * stream invocation. Returns the per-call split into content vs thinking.
 *
 * State invariants:
 *  - `insideThink` flips between `<think>` open and `</think>` close events.
 *  - `pendingPrefix` buffers a partial tag prefix at the end of a chunk
 *    (e.g., `<thi`) so the next chunk can resolve it.
 *
 * On end-of-stream (caller signals via `done=true`), any non-empty
 * `pendingPrefix` is flushed as literal text to whichever stream the
 * current `insideThink` indicates — partial tags at end-of-stream are not
 * magically completed.
 */
function applyThinkTagTracker(
  rawContent: string,
  state: ThinkTagState,
  done: boolean,
): ThinkTagStepResult {
  let text = state.pendingPrefix + rawContent;
  state.pendingPrefix = '';
  let contentOut = '';
  let thinkingOut = '';

  while (text.length > 0) {
    if (state.insideThink) {
      const closeIdx = text.indexOf('</think>');
      if (closeIdx >= 0) {
        thinkingOut += text.substring(0, closeIdx);
        text = text.substring(closeIdx + 8); // 8 = '</think>'.length
        state.insideThink = false;
      } else {
        const partialLen = longestSuffixThatIsPrefix(text, '</think>');
        thinkingOut += text.substring(0, text.length - partialLen);
        state.pendingPrefix = text.substring(text.length - partialLen);
        text = '';
      }
    } else {
      const openIdx = text.indexOf('<think>');
      if (openIdx >= 0) {
        contentOut += text.substring(0, openIdx);
        text = text.substring(openIdx + 7); // 7 = '<think>'.length
        state.insideThink = true;
      } else {
        const partialLen = longestSuffixThatIsPrefix(text, '<think>');
        contentOut += text.substring(0, text.length - partialLen);
        state.pendingPrefix = text.substring(text.length - partialLen);
        text = '';
      }
    }
  }

  // On stream done with non-empty pendingPrefix: flush as literal to whichever
  // stream the current insideThink state indicates (partial tags at end-of-stream
  // are not magically completed).
  if (done && state.pendingPrefix.length > 0) {
    if (state.insideThink) thinkingOut += state.pendingPrefix;
    else contentOut += state.pendingPrefix;
    state.pendingPrefix = '';
  }

  return { contentOut, thinkingOut };
}
