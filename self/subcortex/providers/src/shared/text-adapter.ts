import type { ILogChannel, TraceId } from '@nous/shared';
import { parseModelOutput, type ParsedModelOutput } from './output.js';
import {
  defineProviderAdapter,
  type AdapterCapabilities,
  type AdapterFormatInput,
  type AdapterFormattedRequest,
  type ProviderAdapter,
} from '../schemas/provider-adapter.js';

const TEXT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

export function createTextAdapter(log?: ILogChannel): ProviderAdapter {
  return {
    capabilities: TEXT_ADAPTER_CAPABILITIES,
    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      // Passthrough — text adapter does not transform the request format.
      // Tools are listed as text in the prompt (handled by PromptFormatter), not in API body.
      const systemPrompt = Array.isArray(input.systemPrompt)
        ? input.systemPrompt.join('\n\n')
        : input.systemPrompt;
      return {
        input: {
          prompt: systemPrompt,
          context: input.context,
        },
      };
    },
    parseResponse(output: unknown, traceId: TraceId): ParsedModelOutput {
      // Delegates directly to existing parseModelOutput — identical behavior to pre-harness.
      // Top-level try/catch enforces the never-throw adapter contract (matches Ollama/Anthropic/OpenAI pattern).
      try {
        return parseModelOutput(output, traceId);
      } catch (err) {
        log?.warn('parseResponse caught unexpected error, falling back to text-mode', {
          error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
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

export const textAdapter = defineProviderAdapter({
  adapterKey: 'text',
  displayName: 'Text Fallback',
  protocol: 'text-fallback',
  capabilities: TEXT_ADAPTER_CAPABILITIES,
  create(options) {
    return createTextAdapter(options?.log);
  },
});
