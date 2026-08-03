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

const CODEX_CLI_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: true,
};

export const CODEX_CLI_EXECUTION_CAPABILITY_PROFILE = 'session_bound_command' as const;

export function createCodexCliAdapter(): ProviderAdapter {
  return {
    capabilities: CODEX_CLI_ADAPTER_CAPABILITIES,
    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      return {
        input: {
          prompt: renderCodexCliPrompt(input),
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

export function renderCodexCliPrompt(input: AdapterFormatInput): string {
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
  adapterKey: 'codex-cli',
  displayName: 'Codex CLI',
  protocol: AGENT_CLI_PROTOCOL_ID,
  capabilities: CODEX_CLI_ADAPTER_CAPABILITIES,
  executionCapabilityProfile: CODEX_CLI_EXECUTION_CAPABILITY_PROFILE,
  create() {
    return createCodexCliAdapter();
  },
});

export { providerAdapter as codexCliAdapter };
