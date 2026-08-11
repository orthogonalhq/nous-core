import type { GatewayContextFrame, TraceId } from '@nous/shared';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';
import {
  defineProviderAdapter,
  type AdapterCapabilities,
  type AdapterFormatInput,
  type AdapterFormattedRequest,
  type ProviderAdapter,
} from '../../schemas/provider-adapter.js';
import { parseModelOutput, type ParsedModelOutput } from '../../shared/output.js';

const TABNINE_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: true,
};

export const TABNINE_EXECUTION_CAPABILITY_PROFILE = 'one_shot_command' as const;

export function createTabnineAdapter(): ProviderAdapter {
  return {
    capabilities: TABNINE_ADAPTER_CAPABILITIES,
    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      return {
        input: {
          prompt: renderTabninePrompt(input),
        },
      };
    },
    parseResponse(output: unknown, traceId: TraceId): ParsedModelOutput {
      try {
        return parseModelOutput(output, traceId);
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

export function renderTabninePrompt(input: AdapterFormatInput): string {
  const sections: string[] = [];
  const systemPrompt = Array.isArray(input.systemPrompt)
    ? input.systemPrompt.join('\n\n')
    : input.systemPrompt;

  if (systemPrompt.trim().length > 0) {
    sections.push(systemPrompt.trim());
  }

  for (const frame of input.context) {
    const rendered = renderContextFrame(frame);
    if (rendered.length > 0) {
      sections.push(rendered);
    }
  }

  if (input.toolDefinitions && input.toolDefinitions.length > 0) {
    sections.push(`Available tools:\n${JSON.stringify(input.toolDefinitions, null, 2)}`);
  }

  return sections.join('\n\n');
}

function renderContextFrame(frame: GatewayContextFrame): string {
  const content = typeof frame.content === 'string'
    ? frame.content
    : JSON.stringify(frame.content);
  const trimmed = content.trim();
  if (trimmed.length === 0) return '';

  return `${frame.role}: ${trimmed}`;
}

export const providerAdapter = defineProviderAdapter({
  adapterKey: 'tabnine',
  displayName: 'Tabnine',
  protocol: AGENT_CLI_PROTOCOL_ID,
  capabilities: TABNINE_ADAPTER_CAPABILITIES,
  executionCapabilityProfile: TABNINE_EXECUTION_CAPABILITY_PROFILE,
  create() {
    return createTabnineAdapter();
  },
});

export { providerAdapter as tabnineAdapter };
