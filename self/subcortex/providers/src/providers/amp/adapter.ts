/**
 * Amp provider adapter — ProviderAdapter for the Amp CLI coding agent.
 *
 * Amp is a session-bound CLI agent. This adapter formats canonical prompt/context
 * data into a plain-text request suitable for Amp's stdin protocol, and parses
 * Amp's stdout output back to ParsedModelOutput.
 */
import type { TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../shared/output.js';
import {
  defineProviderAdapter,
  type AdapterCapabilities,
  type AdapterFormatInput,
  type AdapterFormattedRequest,
  type ProviderAdapter,
} from '../../schemas/provider-adapter.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

export const AMP_EXECUTION_CAPABILITY_PROFILE = 'session_bound_command' as const;

const AMP_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

// ── Format helpers ────────────────────────────────────────────────────────────

function formatContextAsText(input: AdapterFormatInput): string {
  const lines: string[] = [];

  const system =
    typeof input.systemPrompt === 'string'
      ? input.systemPrompt
      : input.systemPrompt.join('\n\n');

  if (system) {
    lines.push(system);
    lines.push('');
  }

  for (const frame of input.context) {
    const role = frame.role === 'assistant' ? 'Assistant' : 'User';
    const content =
      typeof frame.content === 'string'
        ? frame.content
        : JSON.stringify(frame.content);
    lines.push(`${role}: ${content}`);
  }

  return lines.join('\n');
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const ampAdapter: ProviderAdapter = {
  capabilities: AMP_CAPABILITIES,

  formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
    return {
      input: {
        prompt: formatContextAsText(input),
      },
    };
  },

  parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
    if (typeof output === 'string') {
      return {
        response: output,
        toolCalls: [],
        memoryCandidates: [],
        contentType: 'text',
      };
    }

    if (
      output !== null &&
      typeof output === 'object' &&
      'response' in output &&
      typeof (output as Record<string, unknown>)['response'] === 'string'
    ) {
      return {
        response: (output as Record<string, unknown>)['response'] as string,
        toolCalls: [],
        memoryCandidates: [],
        contentType: 'text',
      };
    }

    // Fallback: never throw from parseResponse.
    return {
      response: '',
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  },
};

export const providerAdapter = defineProviderAdapter({
  adapterKey: 'amp',
  displayName: 'Amp',
  protocol: AGENT_CLI_PROTOCOL_ID,
  capabilities: AMP_CAPABILITIES,
  executionCapabilityProfile: AMP_EXECUTION_CAPABILITY_PROFILE,
  create() {
    return ampAdapter;
  },
});