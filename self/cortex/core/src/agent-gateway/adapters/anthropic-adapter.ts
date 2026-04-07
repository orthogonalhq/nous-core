/**
 * Anthropic provider adapter — native tool-use, cache boundaries, extended thinking.
 *
 * WR-127 Phase 1.3 — first production ProviderAdapter for the Anthropic Messages API.
 */
import type { TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../output-parser.js';
import type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  ProviderAdapter,
} from './types.js';

const ANTHROPIC_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: true,
  cacheControl: true,
  extendedThinking: true,
  streaming: true,
};

// ── Content type detection (mirrors output-parser.ts logic) ─────────

const OPENUI_PREFIX = '%%openui\n';

const CARD_TAG_PATTERNS = [
  '<StatusCard',
  '<ActionCard',
  '<ApprovalCard',
  '<WorkflowCard',
  '<FollowUpBlock',
];

function detectContentType(response: string): {
  response: string;
  contentType: 'text' | 'openui';
} {
  let stripped = response;
  let hadPrefix = false;
  if (response.startsWith(OPENUI_PREFIX)) {
    stripped = response.slice(OPENUI_PREFIX.length);
    hadPrefix = true;
  }
  const hasCardTag = CARD_TAG_PATTERNS.some((p) => stripped.includes(p));
  if (hadPrefix || hasCardTag) {
    return { response: stripped, contentType: 'openui' };
  }
  return { response, contentType: 'text' };
}

// ── Format helpers ──────────────────────────────────────────────────

interface AnthropicSystemSegment {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

function formatSystemPrompt(
  systemPrompt: string | string[],
): string | AnthropicSystemSegment[] {
  if (typeof systemPrompt === 'string') {
    return systemPrompt;
  }

  // String array — cache boundary composition
  return systemPrompt.map((segment, index) => {
    const seg: AnthropicSystemSegment = { type: 'text', text: segment };
    // Cache control on the last segment (longest cache prefix — Anthropic convention)
    if (index === systemPrompt.length - 1) {
      seg.cache_control = { type: 'ephemeral' };
    }
    return seg;
  });
}

function formatTools(
  toolDefinitions?: readonly import('@nous/shared').ToolDefinition[],
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined {
  if (!toolDefinitions || toolDefinitions.length === 0) return undefined;

  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: (tool.inputSchema as Record<string, unknown>) ?? {},
  }));
}

function formatMessages(
  context: readonly import('@nous/shared').GatewayContextFrame[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return context.map((frame) => ({
    role: frame.role === 'tool' || frame.role === 'system' ? 'user' : frame.role,
    content: frame.content,
  }));
}

// ── Response parsing ────────────────────────────────────────────────

interface AnthropicContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  thinking?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function parseAnthropicResponse(
  output: unknown,
): ParsedModelOutput {
  if (typeof output === 'string') {
    // Plain string — treat as text response
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

  const obj = output as AnthropicResponse;
  const content = obj.content;

  if (!Array.isArray(content)) {
    // No content blocks — check for direct text
    if ('text' in (output as Record<string, unknown>)) {
      const text = (output as Record<string, unknown>).text;
      if (typeof text === 'string') {
        const detected = detectContentType(text);
        return {
          response: detected.response,
          toolCalls: [],
          memoryCandidates: [],
          contentType: detected.contentType,
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

  // Parse content blocks
  const textParts: string[] = [];
  const toolCalls: Array<{ name: string; params: unknown }> = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      if (typeof block.name === 'string') {
        toolCalls.push({ name: block.name, params: block.input ?? {} });
      }
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      thinkingParts.push(block.thinking);
    } else if (block.type === 'thinking' && typeof block.text === 'string') {
      // Some thinking blocks use `text` field
      thinkingParts.push(block.text);
    }
  }

  // Defensive: stop_reason === 'tool_use' but no tool_use blocks → treat as text-only
  const response = textParts.join('');
  const detected = detectContentType(response);

  const result: ParsedModelOutput = {
    response: detected.response,
    toolCalls,
    memoryCandidates: [],
    contentType: detected.contentType,
  };

  if (thinkingParts.length > 0) {
    result.thinkingContent = thinkingParts.join('\n');
  }

  return result;
}

// ── Adapter factory ─────────────────────────────────────────────────

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    capabilities: ANTHROPIC_CAPABILITIES,

    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      const system = formatSystemPrompt(input.systemPrompt);
      const messages = formatMessages(input.context);
      const tools = formatTools(input.toolDefinitions);

      const result: Record<string, unknown> = {
        system,
        messages,
      };

      if (tools) {
        result.tools = tools;
      }

      // Model requirements pass-through
      if (input.modelRequirements) {
        result.model_profile = input.modelRequirements.profile;
      }

      return { input: result };
    },

    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseAnthropicResponse(output);
      } catch {
        // Fallback: never throw from parseResponse
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
