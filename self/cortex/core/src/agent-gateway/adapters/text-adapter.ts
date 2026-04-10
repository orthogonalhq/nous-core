import type { TraceId } from '@nous/shared';
import { parseModelOutput, type ParsedModelOutput } from '../../output-parser.js';
import type { AdapterCapabilities, AdapterFormatInput, AdapterFormattedRequest, ProviderAdapter } from './types.js';

const TEXT_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

export function createTextAdapter(): ProviderAdapter {
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
        console.warn('[nous:text-adapter] parseResponse caught unexpected error, falling back to text-mode', err);
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
