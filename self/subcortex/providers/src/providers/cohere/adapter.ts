/**
 * Cohere provider adapter — native tool-use via Chat API v2.
 *
 * ProviderAdapter for Cohere's Chat API.
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

const COHERE_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: true,
  cacheControl: false,
  extendedThinking: false,
  streaming: true,
};

type CohereRole = 'user' | 'assistant' | 'system' | 'tool';

interface CohereMessage {
  role: CohereRole;
  content?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function formatMessages(
  systemPrompt: string | string[],
  context: readonly import('@nous/shared').GatewayContextFrame[],
): CohereMessage[] {
  const systemText = Array.isArray(systemPrompt) ? systemPrompt.join('\n') : systemPrompt;
  const messages: CohereMessage[] = systemText ? [{ role: 'system', content: systemText }] : [];

  for (const frame of context) {
    if (frame.role === 'tool' && frame.metadata?.tool_call_id) {
      messages.push({
        role: 'tool',
        tool_call_id: frame.metadata.tool_call_id as string,
        content: frame.content,
      });
      continue;
    }

    if (frame.role === 'assistant' && Array.isArray(frame.metadata?.tool_calls)) {
      const toolCalls = (
        frame.metadata!.tool_calls as Array<{ id?: string; name: string; input: unknown }>
      )
        .filter((tc) => tc.id)
        .map((tc) => ({
          id: tc.id as string,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
        }));

      messages.push({
        role: 'assistant',
        content: frame.content.trim() || undefined,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    const role: CohereRole = frame.role === 'system' ? 'system' : frame.role === 'tool' ? 'tool' : frame.role;
    messages.push({ role, content: frame.content });
  }

  return messages;
}

function formatTools(
  toolDefinitions?: readonly import('@nous/shared').ToolDefinition[],
): Array<Record<string, unknown>> | undefined {
  if (!toolDefinitions || toolDefinitions.length === 0) return undefined;

  return toolDefinitions.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

interface CohereContentBlock {
  type?: string;
  text?: string;
}

interface CohereToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface CohereResponse {
  message?: {
    content?: CohereContentBlock[];
    tool_calls?: CohereToolCall[];
  };
}

function parseCohereResponse(output: unknown): ParsedModelOutput {
  if (typeof output === 'string') {
    return { response: output, toolCalls: [], memoryCandidates: [], contentType: 'text' };
  }

  if (!output || typeof output !== 'object') {
    return { response: String(output ?? ''), toolCalls: [], memoryCandidates: [], contentType: 'text' };
  }

  const obj = output as CohereResponse;
  const contentBlocks = obj.message?.content;
  const textParts = Array.isArray(contentBlocks)
    ? contentBlocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string)
    : [];

  const toolCalls: Array<{ name: string; params: unknown; id?: string }> = [];
  if (Array.isArray(obj.message?.tool_calls)) {
    for (const tc of obj.message!.tool_calls!) {
      if (!tc.function?.name) continue;
      let params: unknown = {};
      try {
        params = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        params = {};
      }
      toolCalls.push({ name: tc.function.name, params, id: tc.id });
    }
  }

  return {
    response: textParts.join(''),
    toolCalls,
    memoryCandidates: [],
    contentType: 'text',
  };
}

export function createCohereAdapter(): ProviderAdapter {
  return {
    capabilities: COHERE_CAPABILITIES,

    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      const messages = formatMessages(input.systemPrompt, input.context);
      const tools = formatTools(input.toolDefinitions);

      const result: Record<string, unknown> = { messages };
      if (tools) {
        result.tools = tools;
      }

      return { input: result };
    },

    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseCohereResponse(output);
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

export const providerAdapter = defineProviderAdapter({
  adapterKey: 'cohere',
  displayName: 'Cohere',
  protocol: 'cohere-chat',
  capabilities: COHERE_CAPABILITIES,
  create() {
    return createCohereAdapter();
  },
});

export { providerAdapter as cohereAdapter };
