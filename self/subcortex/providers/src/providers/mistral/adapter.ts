/**
 * Mistral provider adapter — OpenAI Chat Completions wire protocol.
 *
 * Mistral's API is Chat Completions-compatible. This adapter handles:
 * - System prompt flattening (array segments joined, no cache_control).
 * - Context frame mapping to Chat Completions message roles.
 * - Response parsing for text content and tool_calls (defensive only).
 *
 * Do not copy Anthropic-specific constructs: no cache_control segments,
 * no thinking blocks, no top-level combinator flattening, no x-api-key header.
 *
 * parseResponse(...) must not throw. Malformed or unexpected output is caught
 * and returned as a plain text fallback.
 */
import type { ILogChannel, TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../shared/output.js';
import {
  defineProviderAdapter,
  type AdapterCapabilities,
  type AdapterFormatInput,
  type AdapterFormattedRequest,
  type ProviderAdapter,
} from '../../schemas/provider-adapter.js';

const MISTRAL_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: true,
};

const OPENUI_PREFIX = '%%openui\n';

const CARD_TAG_PATTERNS = [
  '<StatusCard',
  '<ActionCard',
  '<ApprovalCard',
  '<WorkflowCard',
  '<FollowUpBlock',
];

function detectContentType(text: string): { response: string; contentType: 'text' | 'openui' } {
  let stripped = text;
  let hadPrefix = false;
  if (text.startsWith(OPENUI_PREFIX)) {
    stripped = text.slice(OPENUI_PREFIX.length);
    hadPrefix = true;
  }
  const hasCardTag = CARD_TAG_PATTERNS.some((p) => stripped.includes(p));
  if (hadPrefix || hasCardTag) {
    return { response: stripped, contentType: 'openui' };
  }
  return { response: text, contentType: 'text' };
}

type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string };

function flattenSystemPrompt(systemPrompt: string | string[]): string {
  return Array.isArray(systemPrompt) ? systemPrompt.join('\n') : systemPrompt;
}

function formatContextMessages(
  context: readonly import('@nous/shared').GatewayContextFrame[],
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const frame of context) {
    if (frame.role === 'user' || frame.role === 'assistant') {
      messages.push({ role: frame.role, content: frame.content });
    } else if (frame.role === 'system') {
      messages.push({ role: 'system', content: frame.content });
    } else if (frame.role === 'tool') {
      if (frame.metadata?.tool_call_id) {
        messages.push({ role: 'tool', content: frame.content, tool_call_id: frame.metadata.tool_call_id as string });
      } else {
        messages.push({ role: 'user', content: frame.content });
      }
    }
  }

  return messages;
}



interface ChatCompletionsChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason?: string;
}

interface ChatCompletionsResponse {
  choices?: ChatCompletionsChoice[];
}

function parseMistralResponse(output: unknown, log?: ILogChannel): ParsedModelOutput {
  if (typeof output === 'string') {
    const detected = detectContentType(output);
    return {
      response: detected.response,
      toolCalls: [],
      memoryCandidates: [],
      contentType: detected.contentType,
    };
  }

  if (!output || typeof output !== 'object') {
    return {
      response: String(output ?? ''),
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  const obj = output as ChatCompletionsResponse;
  const choice = obj.choices?.[0];
  const message = choice?.message;

  if (!message) {
    return {
      response: '',
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  const toolCalls: Array<{ name: string; params: unknown; id?: string }> = [];

  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      if (!tc.function?.name) continue;
      let params: unknown = {};
      try {
        params = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        log?.error(`Mistral: failed to parse tool_call arguments for "${tc.function.name}"`);
      }
      toolCalls.push({ name: tc.function.name, params, id: tc.id });
    }
  }

  const text = message.content ?? '';
  const detected = detectContentType(text);

  return {
    response: detected.response,
    toolCalls,
    memoryCandidates: [],
    contentType: detected.contentType,
  };
}

export function createMistralAdapter(log?: ILogChannel): ProviderAdapter {
  return {
    capabilities: MISTRAL_CAPABILITIES,

    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      const systemText = flattenSystemPrompt(input.systemPrompt);
      const contextMessages = formatContextMessages(input.context);
     

      const messages: ChatMessage[] = [
        { role: 'system', content: systemText },
        ...contextMessages,
      ];

      const body: Record<string, unknown> = { messages };

   

      if (input.modelRequirements) {
        body.model_profile = input.modelRequirements.profile;
      }

      return { input: body };
    },

    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseMistralResponse(output, log);
      } catch (error) {
        log?.error('Mistral parseResponse error — falling back to String(output)', {
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          outputType: typeof output,
          outputKeys: output && typeof output === 'object' ? Object.keys(output) : [],
        });
        return {
          response: String(output ?? ''),
          toolCalls: [],
          memoryCandidates: [],
          contentType: 'text',
        };
      }
    },
  };
}

export const providerAdapter = defineProviderAdapter({
  adapterKey: 'mistral',
  displayName: 'Mistral',
  protocol: 'chat-completions',
  capabilities: MISTRAL_CAPABILITIES,
  create(options) {
    return createMistralAdapter(options?.log);
  },
});

export { providerAdapter as mistralAdapter };
