import type { TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../output-parser.js';
import type { AdapterCapabilities, AdapterFormatInput, AdapterFormattedRequest, ProviderAdapter } from './types.js';

const OPENAI_ADAPTER_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: true,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

export function createOpenAiAdapter(): ProviderAdapter {
  return {
    capabilities: OPENAI_ADAPTER_CAPABILITIES,
    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      const systemPrompt = Array.isArray(input.systemPrompt)
        ? input.systemPrompt.join('\n\n')
        : input.systemPrompt;

      const messages = [
        { role: 'system' as const, content: systemPrompt } as Record<string, unknown>,
        ...input.context.map((frame) => {
          // Tool result with tool_call_id metadata → OpenAI tool result message
          if (frame.role === 'tool' && frame.metadata?.tool_call_id) {
            return {
              role: 'tool' as const,
              content: frame.content,
              tool_call_id: frame.metadata.tool_call_id as string,
            };
          }
          return {
            role: frame.role === 'tool' ? ('user' as const) : frame.role,
            content: frame.content,
          };
        }),
      ];

      const result: Record<string, unknown> = { messages };

      // Map tool definitions to OpenAI tools format
      if (input.toolDefinitions && input.toolDefinitions.length > 0) {
        result.tools = input.toolDefinitions.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: tool.inputSchema ?? {},
          },
        }));
      }

      // ModelRequirements currently has profile + fallbackPolicy only.
      // Extended model parameters (maxTokens, temperature) will be available
      // when ModelRequirements is extended in a future sub-phase.
      // For now, pass through the profile as metadata.
      if (input.modelRequirements) {
        result.model_profile = input.modelRequirements.profile;
      }

      return { input: result };
    },
    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseOpenAiResponse(output);
      } catch {
        // Fallback to text-mode — never throw
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

function parseOpenAiResponse(output: unknown): ParsedModelOutput {
  if (typeof output !== 'object' || output === null) {
    return {
      response: String(output ?? ''),
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  const obj = output as Record<string, unknown>;

  // Handle OpenAI chat completion response shape
  // { choices: [{ message: { content, tool_calls } }] }
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>)?.message;
    if (message && typeof message === 'object') {
      const msg = message as Record<string, unknown>;
      const content = typeof msg.content === 'string' ? msg.content : '';
      const toolCalls = parseOpenAiToolCalls(msg.tool_calls);
      return {
        response: content,
        toolCalls,
        memoryCandidates: [],
        contentType: 'text',
      };
    }
  }

  // Handle direct message shape
  if ('content' in obj || 'tool_calls' in obj) {
    const content = typeof obj.content === 'string' ? obj.content : '';
    const toolCalls = parseOpenAiToolCalls(obj.tool_calls);
    return {
      response: content,
      toolCalls,
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  // Handle plain response field (our canonical format)
  if ('response' in obj && typeof obj.response === 'string') {
    return {
      response: obj.response,
      toolCalls: [],
      memoryCandidates: [],
      contentType: 'text',
    };
  }

  return {
    response: String(output),
    toolCalls: [],
    memoryCandidates: [],
    contentType: 'text',
  };
}

function parseOpenAiToolCalls(
  toolCalls: unknown,
): Array<{ name: string; params: unknown; id?: string }> {
  if (!Array.isArray(toolCalls)) return [];
  const result: Array<{ name: string; params: unknown; id?: string }> = [];
  for (const tc of toolCalls) {
    if (tc && typeof tc === 'object' && 'function' in tc) {
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj.function;
      if (fn && typeof fn === 'object') {
        const fnObj = fn as Record<string, unknown>;
        const name = typeof fnObj.name === 'string' ? fnObj.name : '';
        let params: unknown = {};
        if (typeof fnObj.arguments === 'string') {
          try { params = JSON.parse(fnObj.arguments); } catch { params = {}; }
        }
        const id = typeof tcObj.id === 'string' ? tcObj.id : undefined;
        if (name) result.push({ name, params, id });
      }
    }
  }
  return result;
}
