import { describe, expect, it } from 'vitest';
import { createOpenAiAdapter } from '../../../agent-gateway/adapters/openai-adapter.js';
import type { TraceId, ToolDefinition } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440103' as TraceId;

describe('createOpenAiAdapter', () => {
  const adapter = createOpenAiAdapter();

  describe('capabilities', () => {
    it('has nativeToolUse true, others false', () => {
      expect(adapter.capabilities.nativeToolUse).toBe(true);
      expect(adapter.capabilities.cacheControl).toBe(false);
      expect(adapter.capabilities.extendedThinking).toBe(false);
      expect(adapter.capabilities.streaming).toBe(false);
    });
  });

  describe('formatRequest', () => {
    it('maps tools to OpenAI format with type: function wrapper', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'test_tool',
          version: '1.0.0',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          outputSchema: {},
          capabilities: ['read'],
          permissionScope: 'project',
        },
      ];
      const result = adapter.formatRequest({
        systemPrompt: 'You are an assistant.',
        context: [],
        toolDefinitions: tools,
      });
      const input = result.input as Record<string, unknown>;
      expect(input.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: { x: { type: 'string' } } },
          },
        },
      ]);
    });

    it('includes model_profile from modelRequirements', () => {
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        modelRequirements: { profile: 'review-standard', fallbackPolicy: 'block_if_unmet' },
      });
      const input = result.input as Record<string, unknown>;
      expect(input.model_profile).toBe('review-standard');
    });

    it('handles empty tools array — no tools key in output', () => {
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        toolDefinitions: [],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.tools).toBeUndefined();
    });

    it('joins string[] systemPrompt', () => {
      const result = adapter.formatRequest({
        systemPrompt: ['Part A.', 'Part B.'],
        context: [],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<{ role: string; content: string }>;
      expect(messages[0].content).toBe('Part A.\n\nPart B.');
    });

    it('emits tool result message for tool frame with metadata.tool_call_id', () => {
      const result = adapter.formatRequest({
        systemPrompt: 'test',
        context: [
          {
            role: 'tool' as const,
            content: 'weather data',
            source: 'tool_result' as const,
            createdAt: '2026-01-01T00:00:00Z',
            metadata: { tool_call_id: 'call_xyz' },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      // System message + tool result
      expect(messages).toHaveLength(2);
      expect(messages[1]).toEqual({
        role: 'tool',
        content: 'weather data',
        tool_call_id: 'call_xyz',
      });
    });

    it('falls back to role: user for tool frame without metadata.tool_call_id', () => {
      const result = adapter.formatRequest({
        systemPrompt: 'test',
        context: [
          {
            role: 'tool' as const,
            content: 'tool output',
            source: 'tool_result' as const,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({ role: 'user', content: 'tool output' });
    });
  });

  describe('parseResponse', () => {
    it('handles choices[].message.content response', () => {
      const output = {
        choices: [{ message: { content: 'Hello from OpenAI' } }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('Hello from OpenAI');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles choices[].message.tool_calls with function calls', () => {
      const output = {
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_456',
              function: {
                name: 'get_weather',
                arguments: '{"city":"NYC"}',
              },
            }],
          },
        }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([
        { name: 'get_weather', params: { city: 'NYC' }, id: 'call_456' },
      ]);
    });

    it('preserves tool call id from tool_calls', () => {
      const output = {
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_789',
              function: { name: 'test', arguments: '{}' },
            }],
          },
        }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls[0].id).toBe('call_789');
    });

    it('handles direct content/tool_calls (no choices wrapper)', () => {
      const output = {
        content: 'Direct message',
        tool_calls: [{
          function: { name: 'test', arguments: '{}' },
        }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('Direct message');
      expect(result.toolCalls).toEqual([{ name: 'test', params: {} }]);
    });

    it('handles canonical { response } format', () => {
      const output = { response: 'canonical response' };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('canonical response');
    });

    it('falls back to text-mode on malformed input — never throws', () => {
      const output = 12345;
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('12345');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('returns text-mode fallback for undefined input', () => {
      expect(() => adapter.parseResponse(undefined, TRACE_ID)).not.toThrow();
      const result = adapter.parseResponse(undefined, TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('returns text-mode fallback for empty string input', () => {
      expect(() => adapter.parseResponse('', TRACE_ID)).not.toThrow();
      const result = adapter.parseResponse('', TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('returns text-mode fallback for unexpected object input', () => {
      expect(() => adapter.parseResponse({ unexpected: true }, TRACE_ID)).not.toThrow();
      const result = adapter.parseResponse({ unexpected: true }, TRACE_ID);
      expect(typeof result.response).toBe('string');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('handles null input gracefully', () => {
      const result = adapter.parseResponse(null, TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles tool_calls with invalid JSON arguments', () => {
      const output = {
        choices: [{
          message: {
            content: 'ok',
            tool_calls: [{
              function: { name: 'broken', arguments: 'not-json' },
            }],
          },
        }],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([{ name: 'broken', params: {} }]);
    });
  });
});
