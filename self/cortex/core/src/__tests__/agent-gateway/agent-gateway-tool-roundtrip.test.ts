/**
 * Integration test: adapter tool round-trip formatting.
 *
 * Verifies the full cycle:
 *   1. Provider returns tool_calls in response
 *   2. Adapter parses response → ParsedModelOutput with toolCalls
 *   3. Gateway stores toolCalls metadata on assistant context frame
 *   4. Gateway stores tool_call_id metadata on tool result context frame
 *   5. Adapter re-formats context frames → provider-specific request with tool_calls + tool_call_id
 *
 * This proves the round-trip: parseResponse → context frame metadata → formatRequest
 */
import { describe, expect, it } from 'vitest';
import type { GatewayContextFrame, TraceId } from '@nous/shared';
import { createOpenAiAdapter } from '../../agent-gateway/adapters/openai-adapter.js';
import { createOllamaAdapter } from '../../agent-gateway/adapters/ollama-adapter.js';
import { createAnthropicAdapter } from '../../agent-gateway/adapters/anthropic-adapter.js';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440300' as TraceId;

/**
 * Simulates the gateway's context frame accumulation after a model response
 * with tool calls and a subsequent tool result.
 *
 * This mirrors the logic in AgentGateway.run() (lines 286-294 for tool_calls
 * metadata, lines 648-654 for tool_call_id metadata).
 */
function simulateGatewayContextAccumulation(
  parsedOutput: { response: string; toolCalls: Array<{ name: string; params: unknown; id?: string }> },
  toolResultContent: string,
): GatewayContextFrame[] {
  const frames: GatewayContextFrame[] = [];

  // User message that triggered the tool call
  frames.push({
    role: 'user',
    source: 'initial_context',
    content: 'What is the weather in NYC?',
    createdAt: '2026-01-01T00:00:00Z',
  });

  // Assistant frame with tool_calls metadata (mirrors agent-gateway.ts:286-294)
  const assistantFrame: GatewayContextFrame = {
    role: 'assistant',
    source: 'model_output',
    content: parsedOutput.response,
    createdAt: '2026-01-01T00:00:01Z',
  };
  if (parsedOutput.toolCalls.length > 0) {
    assistantFrame.metadata = {
      tool_calls: parsedOutput.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: tc.params,
      })),
    };
  }
  frames.push(assistantFrame);

  // Tool result frame with tool_call_id metadata (mirrors agent-gateway.ts:648-654)
  const toolCallId = parsedOutput.toolCalls[0]?.id;
  const toolFrame: GatewayContextFrame = {
    role: 'tool',
    source: 'tool_result',
    content: toolResultContent,
    createdAt: '2026-01-01T00:00:02Z',
  };
  if (toolCallId) {
    toolFrame.metadata = { tool_call_id: toolCallId };
  }
  frames.push(toolFrame);

  return frames;
}

describe('Adapter tool round-trip formatting', () => {
  describe('OpenAI adapter round-trip', () => {
    const adapter = createOpenAiAdapter();

    it('parses tool_calls from response, then re-formats context frames correctly', () => {
      // Step 1: Parse a provider response with tool_calls
      const providerResponse = {
        choices: [{
          message: {
            content: 'Let me check the weather.',
            tool_calls: [{
              id: 'call_weather_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"NYC"}',
              },
            }],
          },
        }],
      };
      const parsed = adapter.parseResponse(providerResponse, TRACE_ID);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0]).toEqual({
        name: 'get_weather',
        params: { city: 'NYC' },
        id: 'call_weather_1',
      });

      // Step 2: Simulate gateway context accumulation
      const frames = simulateGatewayContextAccumulation(parsed, '72°F and sunny');

      // Step 3: Re-format with adapter
      const formatted = adapter.formatRequest({
        systemPrompt: 'You are a weather assistant.',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;

      // system + user + assistant(tool_calls) + tool(tool_call_id)
      expect(messages).toHaveLength(4);

      // Verify assistant message has tool_calls array
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'Let me check the weather.',
        tool_calls: [{
          id: 'call_weather_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"NYC"}',
          },
        }],
      });

      // Verify tool result message has tool_call_id
      expect(messages[3]).toEqual({
        role: 'tool',
        content: '72°F and sunny',
        tool_call_id: 'call_weather_1',
      });
    });
  });

  describe('Ollama adapter round-trip', () => {
    const adapter = createOllamaAdapter('gemma4:12b');

    it('parses tool_calls from response (with id), then re-formats context frames correctly', () => {
      // Step 1: Parse response with tool_calls including id
      const providerResponse = {
        content: 'Checking weather.',
        tool_calls: [{
          id: 'call_ollama_1',
          function: {
            name: 'get_weather',
            arguments: { city: 'NYC' },
          },
        }],
      };
      const parsed = adapter.parseResponse(providerResponse, TRACE_ID);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0].id).toBe('call_ollama_1');

      // Step 2: Simulate gateway context accumulation
      const frames = simulateGatewayContextAccumulation(parsed, '72°F and sunny');

      // Step 3: Re-format with adapter
      const formatted = adapter.formatRequest({
        systemPrompt: 'You are a weather assistant.',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;

      // system + user + assistant(tool_calls) + tool(tool_call_id)
      expect(messages).toHaveLength(4);

      // Verify assistant message has tool_calls
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'Checking weather.',
        tool_calls: [{
          id: 'call_ollama_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: { city: 'NYC' },
          },
        }],
      });

      // Verify tool result has tool_call_id
      expect(messages[3]).toEqual({
        role: 'tool',
        content: '72°F and sunny',
        tool_call_id: 'call_ollama_1',
      });
    });

    it('handles round-trip when provider response lacks id on tool_calls', () => {
      // Ollama may not return id on tool_calls
      const providerResponse = {
        content: '',
        tool_calls: [{
          function: {
            name: 'get_weather',
            arguments: { city: 'NYC' },
          },
        }],
      };
      const parsed = adapter.parseResponse(providerResponse, TRACE_ID);
      expect(parsed.toolCalls[0].id).toBeUndefined();

      // Gateway stores undefined id
      const frames = simulateGatewayContextAccumulation(parsed, '72°F');

      // Adapter generates synthetic id during formatting
      const formatted = adapter.formatRequest({
        systemPrompt: 'test',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;
      const assistantMsg = messages[2] as Record<string, unknown>;
      const toolCalls = assistantMsg.tool_calls as Array<Record<string, unknown>>;
      // Synthetic id should be generated
      expect(toolCalls[0].id).toBe('call_0');
    });
  });

  describe('SP 1.15 RC-3 — round-trip carries `name` on tool result wire message', () => {
    // Verification Sweep extension per SP 1.15 implementation plan task 26.
    // Existing assertions above use the helper which leaves `frame.name`
    // unset — they continue to assert the no-`name` shape. This block
    // exercises the with-`name` round-trip for both Ollama and OpenAI
    // (Anthropic uses tool_use_id and is intentionally unchanged).
    it('Ollama adapter — when frame.name is set on the tool result frame, the wire message includes it', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const frames: GatewayContextFrame[] = [
        {
          role: 'user',
          source: 'initial_context',
          content: 'List my workflows',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          role: 'assistant',
          source: 'model_output',
          content: 'I will list them.',
          createdAt: '2026-01-01T00:00:01Z',
          metadata: {
            tool_calls: [{ id: 'call_a', name: 'workflow_list', input: {} }],
          },
        },
        {
          role: 'tool',
          source: 'tool_result',
          content: '[{"id":"wf-1","name":"daily-summary"}]',
          createdAt: '2026-01-01T00:00:02Z',
          name: 'workflow_list',
          metadata: { tool_call_id: 'call_a' },
        },
      ];
      const formatted = adapter.formatRequest({
        systemPrompt: 'You are a helpful assistant.',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;
      // system + user + assistant(tool_calls) + tool(name, tool_call_id)
      const toolMsg = messages[messages.length - 1];
      expect(toolMsg.tool_call_id).toBe('call_a');
      expect(toolMsg.name).toBe('workflow_list');
    });

    it('OpenAI adapter — when frame.name is set on the tool result frame, the wire message includes it', () => {
      const adapter = createOpenAiAdapter();
      const frames: GatewayContextFrame[] = [
        {
          role: 'user',
          source: 'initial_context',
          content: 'List my workflows',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          role: 'assistant',
          source: 'model_output',
          content: 'I will list them.',
          createdAt: '2026-01-01T00:00:01Z',
          metadata: {
            tool_calls: [{ id: 'call_a', name: 'workflow_list', input: {} }],
          },
        },
        {
          role: 'tool',
          source: 'tool_result',
          content: '[{"id":"wf-1","name":"daily-summary"}]',
          createdAt: '2026-01-01T00:00:02Z',
          name: 'workflow_list',
          metadata: { tool_call_id: 'call_a' },
        },
      ];
      const formatted = adapter.formatRequest({
        systemPrompt: 'You are a helpful assistant.',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;
      const toolMsg = messages[messages.length - 1];
      expect(toolMsg.tool_call_id).toBe('call_a');
      expect(toolMsg.name).toBe('workflow_list');
    });
  });

  describe('Anthropic adapter round-trip', () => {
    const adapter = createAnthropicAdapter();

    it('parses tool_use from response, then re-formats context frames correctly', () => {
      // Step 1: Parse Anthropic response with tool_use blocks
      const providerResponse = {
        content: [
          { type: 'text', text: 'Let me check the weather.' },
          {
            type: 'tool_use',
            id: 'toolu_weather_1',
            name: 'get_weather',
            input: { city: 'NYC' },
          },
        ],
        stop_reason: 'tool_use',
      };
      const parsed = adapter.parseResponse(providerResponse, TRACE_ID);
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0]).toEqual({
        name: 'get_weather',
        params: { city: 'NYC' },
        id: 'toolu_weather_1',
      });

      // Step 2: Simulate gateway context accumulation
      const frames = simulateGatewayContextAccumulation(parsed, '72°F and sunny');

      // Step 3: Re-format with adapter
      const formatted = adapter.formatRequest({
        systemPrompt: 'You are a weather assistant.',
        context: frames,
      });
      const messages = (formatted.input as Record<string, unknown>).messages as Array<Record<string, unknown>>;

      // user + assistant(tool_use blocks) + user(tool_result block)
      expect(messages).toHaveLength(3);

      // Verify assistant has tool_use content blocks
      expect(messages[1].role).toBe('assistant');
      const assistantContent = messages[1].content as Array<Record<string, unknown>>;
      expect(assistantContent).toHaveLength(2);
      expect(assistantContent[0]).toEqual({ type: 'text', text: 'Let me check the weather.' });
      expect(assistantContent[1]).toEqual({
        type: 'tool_use',
        id: 'toolu_weather_1',
        name: 'get_weather',
        input: { city: 'NYC' },
      });

      // Verify tool result content block
      expect(messages[2].role).toBe('user');
      const toolContent = messages[2].content as Array<Record<string, unknown>>;
      expect(toolContent[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'toolu_weather_1',
        content: '72°F and sunny',
      });
    });
  });
});
