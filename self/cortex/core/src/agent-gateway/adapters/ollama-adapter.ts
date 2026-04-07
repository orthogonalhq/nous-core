/**
 * Ollama adapter — ProviderAdapter for local Ollama models.
 *
 * Supports native tool calling for capable models (Gemma 4, Qwen, Llama 3.x, Mistral)
 * and falls back to text-listed tools for unknown models.
 *
 * Thinking mode: extracts thinking/reasoning content from Ollama responses and
 * populates ParsedModelOutput.thinkingContent.
 *
 * GOTCHA: streaming + thinking mode breaks OpenAI compat for tool calls.
 * The adapter sets stream: false when tools are present.
 *
 * WR-127 Phase 1.4
 */
import type { TraceId } from '@nous/shared';
import type { ParsedModelOutput } from '../../output-parser.js';
import type {
  AdapterCapabilities,
  AdapterFormatInput,
  AdapterFormattedRequest,
  ProviderAdapter,
} from './types.js';

// ── Model capability detection ────────────────────────────────────────────────

/**
 * Model family prefixes known to support native tool calling via Ollama.
 * These models use OpenAI-compatible tool_calls in Ollama's /api/chat response.
 */
const TOOL_CAPABLE_PREFIXES: readonly string[] = [
  'gemma4',
  'qwen',
  'qwen2.5',
  'qwen3',
  'llama3.1',
  'llama3.2',
  'llama3.3',
  'mistral',
];

/**
 * Determines whether a model supports native tool calling based on its modelId.
 * Uses prefix matching against the known-capable model families.
 *
 * @param modelId - The Ollama model identifier (e.g. 'gemma4:12b', 'qwen2.5:7b')
 * @returns true if the model supports native tool use
 */
export function isToolCapableModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return TOOL_CAPABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// ── Thinking content extraction ───────────────────────────────────────────────

/**
 * Regex to match <think>...</think> blocks in model output.
 * Used by Qwen 3.x and some other models for reasoning traces.
 */
const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/g;

/**
 * Extracts thinking/reasoning content from an Ollama response.
 *
 * Sources (in priority order):
 * 1. `thinking` field on the message object (Ollama native, used by Gemma 4)
 * 2. `<think>...</think>` tags in message content (Qwen 3.x style)
 *
 * @returns Object with extracted thinking content and cleaned response text
 */
function extractThinking(
  content: string,
  thinkingField?: string,
): { cleanContent: string; thinkingContent: string | undefined } {
  // Priority 1: Ollama-native thinking field
  if (thinkingField && thinkingField.trim().length > 0) {
    return { cleanContent: content, thinkingContent: thinkingField.trim() };
  }

  // Priority 2: <think> tags in content
  const thinkingParts: string[] = [];
  const cleanContent = content.replace(THINK_TAG_REGEX, (_match, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed.length > 0) thinkingParts.push(trimmed);
    return '';
  }).trim();

  if (thinkingParts.length > 0) {
    return { cleanContent, thinkingContent: thinkingParts.join('\n\n') };
  }

  return { cleanContent: content, thinkingContent: undefined };
}

/**
 * Strips thinking blocks from assistant messages in conversation context.
 * Prevents thinking content from being fed back to the model in multi-turn,
 * which can cause confusion and degrade response quality.
 */
function stripThinkingFromContext(content: string): string {
  return content.replace(THINK_TAG_REGEX, '').trim();
}

// ── Response parsing ──────────────────────────────────────────────────────────

/**
 * OpenUI card tag patterns for content type detection.
 */
const CARD_TAG_PATTERNS = [
  '<StatusCard',
  '<ActionCard',
  '<ApprovalCard',
  '<WorkflowCard',
  '<FollowUpBlock',
];

function detectContentType(response: string): 'text' | 'openui' {
  const OPENUI_PREFIX = '%%openui\n';
  if (response.startsWith(OPENUI_PREFIX)) return 'openui';
  if (CARD_TAG_PATTERNS.some((pattern) => response.includes(pattern))) return 'openui';
  return 'text';
}

/**
 * Parses Ollama tool_calls from message.tool_calls array.
 * Ollama uses OpenAI-compatible format:
 * { function: { name: string, arguments: Record<string, unknown> | string } }
 */
function parseOllamaToolCalls(
  toolCalls: unknown,
): Array<{ name: string; params: unknown }> {
  if (!Array.isArray(toolCalls)) return [];
  const result: Array<{ name: string; params: unknown }> = [];

  for (const tc of toolCalls) {
    if (tc && typeof tc === 'object' && 'function' in tc) {
      const fn = (tc as Record<string, unknown>).function;
      if (fn && typeof fn === 'object') {
        const fnObj = fn as Record<string, unknown>;
        const name = typeof fnObj.name === 'string' ? fnObj.name : '';
        let params: unknown = {};

        // Ollama may return arguments as string (JSON) or object
        if (typeof fnObj.arguments === 'string') {
          try {
            params = JSON.parse(fnObj.arguments);
          } catch {
            params = {};
          }
        } else if (fnObj.arguments && typeof fnObj.arguments === 'object') {
          params = fnObj.arguments;
        }

        if (name) result.push({ name, params });
      }
    }
  }

  return result;
}

/**
 * Parses an Ollama response into canonical ParsedModelOutput.
 *
 * Handles three response shapes:
 * 1. Message object with tool_calls (native tool use response)
 * 2. Message object with content + optional thinking (chat response)
 * 3. Plain string (generate endpoint or passthrough)
 */
function parseOllamaResponse(output: unknown): ParsedModelOutput {
  // Handle plain string responses
  if (typeof output === 'string') {
    const { cleanContent, thinkingContent } = extractThinking(output);
    return {
      response: cleanContent,
      toolCalls: [],
      memoryCandidates: [],
      contentType: detectContentType(cleanContent),
      thinkingContent,
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

  // Message object shape (from OllamaProvider when tool_calls present, or direct)
  const content = typeof obj.content === 'string' ? obj.content : '';
  const toolCalls = parseOllamaToolCalls(obj.tool_calls);
  const thinkingField = typeof obj.thinking === 'string' ? obj.thinking : undefined;

  const { cleanContent, thinkingContent } = extractThinking(content, thinkingField);

  return {
    response: cleanContent,
    toolCalls,
    memoryCandidates: [],
    contentType: detectContentType(cleanContent),
    thinkingContent,
  };
}

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Creates an Ollama ProviderAdapter.
 *
 * @param modelId - Optional model identifier for capability detection.
 *   When provided, the adapter checks if the model supports native tool calling.
 *   When omitted, defaults to tool-capable (adapter still checks toolDefinitions presence).
 */
export function createOllamaAdapter(modelId?: string): ProviderAdapter {
  const toolCapable = modelId ? isToolCapableModel(modelId) : true;

  const capabilities: AdapterCapabilities = {
    nativeToolUse: toolCapable,
    cacheControl: false,
    extendedThinking: true,
    streaming: true,
  };

  return {
    capabilities,

    formatRequest(input: AdapterFormatInput): AdapterFormattedRequest {
      // Ollama does not support cache boundaries — join system segments
      const systemPrompt = Array.isArray(input.systemPrompt)
        ? input.systemPrompt.join('\n\n')
        : input.systemPrompt;

      // Build messages array
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      for (const frame of input.context) {
        let content = frame.content;

        // Strip thinking blocks from assistant messages in multi-turn
        // to avoid confusing the model with prior reasoning traces
        if (frame.role === 'assistant') {
          content = stripThinkingFromContext(content);
        }

        messages.push({
          role: frame.role,
          content,
        });
      }

      const result: Record<string, unknown> = { messages };

      // Native tool use: include tools in request body when model supports it
      const hasTools = input.toolDefinitions && input.toolDefinitions.length > 0;
      if (hasTools && toolCapable) {
        result.tools = input.toolDefinitions!.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: tool.inputSchema ?? {},
          },
        }));

        // GOTCHA: streaming + thinking mode breaks tool call parsing.
        // Force stream: false when tools are present for reliable tool calling.
        result.stream = false;
      }

      // Pass model requirements metadata
      if (input.modelRequirements) {
        result.model_profile = input.modelRequirements.profile;
      }

      return { input: result };
    },

    parseResponse(output: unknown, _traceId: TraceId): ParsedModelOutput {
      try {
        return parseOllamaResponse(output);
      } catch {
        // Never throw — return text fallback
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
