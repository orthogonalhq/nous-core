import type { TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../shared/output.js';
import {
  defineProviderAdapter,
  type AdapterCapabilities,
  type AdapterFormatInput,
  type AdapterFormattedRequest,
  type ProviderAdapter,
} from '../../schemas/provider-adapter.js';

const GEMINI_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: true,
};

export function createGeminiAdapter(): ProviderAdapter {
  return {
    capabilities: GEMINI_ADAPTER_CAPABILITIES,
    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      const systemSegments = Array.isArray(input.systemPrompt)
        ? input.systemPrompt
        : [input.systemPrompt];

      const messages = input.context.map((frame) => ({
        role: frame.role === 'tool' ? ('user' as const) : frame.role,
        content: frame.content,
      }));

      return {
        input: {
          messages,
          systemSegments,
          ...(input.modelRequirements ? { model_profile: input.modelRequirements.profile } : {}),
        },
      };
    },
    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseGeminiResponse(output);
      } catch {
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

function parseGeminiResponse(output: unknown): ParsedModelOutput {
  if (typeof output === 'string') {
    return {
      response: output,
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
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

  const obj = output as Record<string, unknown>;
  if (typeof obj.response === 'string') {
    return {
      response: obj.response,
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  const choices = obj.candidates;
  if (Array.isArray(choices)) {
    const content = (choices[0] as Record<string, unknown> | undefined)?.content;
    const parts = content && typeof content === 'object'
      ? (content as Record<string, unknown>).parts
      : undefined;
    if (Array.isArray(parts)) {
      return {
        response: parts
          .map((part) => {
            if (!part || typeof part !== 'object') return '';
            const text = (part as Record<string, unknown>).text;
            return typeof text === 'string' ? text : '';
          })
          .join(''),
        toolCalls: [],
        memoryCandidates: [],
        contentType: 'text',
      };
    }
  }

  return {
    response: String(output),
    toolCalls: [],
    memoryCandidates: [],
    contentType: 'text',
  };
}

export const providerAdapter = defineProviderAdapter({
  adapterKey: 'gemini',
  displayName: 'Google Gemini',
  protocol: 'gemini-generate-content',
  capabilities: GEMINI_ADAPTER_CAPABILITIES,
  create() {
    return createGeminiAdapter();
  },
});
