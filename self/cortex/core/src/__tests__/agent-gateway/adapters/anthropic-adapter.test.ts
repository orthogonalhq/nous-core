import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../../agent-gateway/adapters/anthropic-adapter.js';
import type { AdapterFormatInput } from '../../../agent-gateway/adapters/types.js';

describe('createAnthropicAdapter', () => {
  const adapter = createAnthropicAdapter();

  describe('capabilities', () => {
    it('declares native tool-use, cache control, extended thinking, streaming', () => {
      expect(adapter.capabilities).toEqual({
        nativeToolUse: true,
        cacheControl: true,
        extendedThinking: true,
        streaming: true,
      });
    });
  });

  describe('formatRequest', () => {
    it('formats string system prompt as-is', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'You are a helpful assistant.',
        context: [],
      };
      const result = adapter.formatRequest(input);
      expect(result.input.system).toBe('You are a helpful assistant.');
      expect(result.input.messages).toEqual([]);
    });

    it('formats string[] system prompt with cache_control on last segment', () => {
      const input: AdapterFormatInput = {
        systemPrompt: ['Identity block', 'Task frame', 'Guardrails'],
        context: [],
      };
      const result = adapter.formatRequest(input);
      const system = result.input.system as Array<{
        type: string;
        text: string;
        cache_control?: { type: string };
      }>;
      expect(system).toHaveLength(3);
      expect(system[0]).toEqual({ type: 'text', text: 'Identity block' });
      expect(system[1]).toEqual({ type: 'text', text: 'Task frame' });
      expect(system[2]).toEqual({
        type: 'text',
        text: 'Guardrails',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('maps tool definitions to Anthropic tools format', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [],
        toolDefinitions: [
          {
            name: 'search',
            description: 'Search for files',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
      };
      const result = adapter.formatRequest(input);
      expect(result.input.tools).toEqual([
        {
          name: 'search',
          description: 'Search for files',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ]);
    });

    it('omits tools field when no tool definitions', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [],
      };
      const result = adapter.formatRequest(input);
      expect(result.input.tools).toBeUndefined();
    });

    it('maps context frames to messages with role mapping', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [
          { role: 'user', content: 'Hello', source: 'initial_context', createdAt: '2026-01-01T00:00:00Z' },
          { role: 'assistant', content: 'Hi there', source: 'model_response', createdAt: '2026-01-01T00:00:01Z' },
          { role: 'tool', content: 'Tool result', source: 'tool_result', createdAt: '2026-01-01T00:00:02Z' },
        ],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
      expect(messages[2]).toEqual({ role: 'user', content: 'Tool result' }); // tool -> user
    });

    it('formats multi-turn tool calling round-trip (assistant tool_use + tool_result)', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [
          {
            role: 'user',
            content: 'What is the weather in NYC?',
            source: 'initial_context',
            createdAt: '2026-01-01T00:00:00Z',
          },
          {
            role: 'assistant',
            content: 'Let me check the weather.',
            source: 'model_response',
            createdAt: '2026-01-01T00:00:01Z',
            metadata: {
              tool_calls: [
                { id: 'toolu_weather', name: 'get_weather', input: { city: 'NYC' } },
              ],
            },
          },
          {
            role: 'tool',
            content: '72°F and sunny',
            source: 'tool_result',
            createdAt: '2026-01-01T00:00:02Z',
            metadata: { tool_call_id: 'toolu_weather' },
          },
          {
            role: 'assistant',
            content: 'The weather in NYC is 72°F and sunny.',
            source: 'model_response',
            createdAt: '2026-01-01T00:00:03Z',
          },
        ],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: unknown }>;

      expect(messages).toHaveLength(4);

      // User message
      expect(messages[0]).toEqual({ role: 'user', content: 'What is the weather in NYC?' });

      // Assistant message with tool_use content blocks
      expect(messages[1].role).toBe('assistant');
      const assistantContent = messages[1].content as Array<Record<string, unknown>>;
      expect(assistantContent).toHaveLength(2);
      expect(assistantContent[0]).toEqual({ type: 'text', text: 'Let me check the weather.' });
      expect(assistantContent[1]).toEqual({
        type: 'tool_use',
        id: 'toolu_weather',
        name: 'get_weather',
        input: { city: 'NYC' },
      });

      // Tool result as user message with tool_result content block
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toEqual([
        {
          type: 'tool_result',
          tool_use_id: 'toolu_weather',
          content: '72°F and sunny',
        },
      ]);

      // Final assistant message
      expect(messages[3]).toEqual({
        role: 'assistant',
        content: 'The weather in NYC is 72°F and sunny.',
      });
    });

    it('passes model requirements as model_profile', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [],
        modelRequirements: { profile: 'fast' },
      };
      const result = adapter.formatRequest(input);
      expect(result.input.model_profile).toBe('fast');
    });

    it('emits tool_result content block for tool frame with metadata.tool_call_id', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [
          {
            role: 'tool',
            content: 'search result here',
            source: 'tool_result',
            createdAt: '2026-01-01T00:00:00Z',
            name: 'search',
            metadata: { tool_call_id: 'toolu_abc123' },
          },
        ],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: unknown }>;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toEqual([
        {
          type: 'tool_result',
          tool_use_id: 'toolu_abc123',
          content: 'search result here',
        },
      ]);
    });

    it('falls back to role: user for tool frame without metadata.tool_call_id', () => {
      const input: AdapterFormatInput = {
        systemPrompt: 'test',
        context: [
          {
            role: 'tool',
            content: 'tool output',
            source: 'tool_result',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      };
      const result = adapter.formatRequest(input);
      const messages = result.input.messages as Array<{ role: string; content: unknown }>;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'user', content: 'tool output' });
    });
  });

  describe('parseResponse', () => {
    const traceId = '00000000-0000-0000-0000-000000000001' as never;

    it('parses text content blocks into response', () => {
      const output = {
        content: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'world!' },
        ],
        stop_reason: 'end_turn',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('Hello, world!');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('parses tool_use content blocks into toolCalls', () => {
      const output = {
        content: [
          { type: 'text', text: 'Let me search for that.' },
          {
            type: 'tool_use',
            id: 'toolu_abc',
            name: 'search',
            input: { query: 'test' },
          },
        ],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('Let me search for that.');
      expect(result.toolCalls).toEqual([
        { name: 'search', params: { query: 'test' }, id: 'toolu_abc' },
      ]);
    });

    it('preserves tool_use block id in toolCalls', () => {
      const output = {
        content: [
          { type: 'tool_use', id: 'toolu_123', name: 'read_file', input: { path: '/x' } },
        ],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.toolCalls[0].id).toBe('toolu_123');
    });

    it('parses multiple tool_use blocks', () => {
      const output = {
        content: [
          { type: 'tool_use', name: 'search', input: { q: 'a' } },
          { type: 'tool_use', name: 'read', input: { path: '/x' } },
        ],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('search');
      expect(result.toolCalls[1].name).toBe('read');
    });

    it('parses thinking content blocks into thinkingContent', () => {
      const output = {
        content: [
          { type: 'thinking', thinking: 'I need to consider...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
        stop_reason: 'end_turn',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('Here is my answer.');
      expect(result.thinkingContent).toBe('I need to consider...');
    });

    it('handles interleaved text + tool_use + thinking blocks', () => {
      const output = {
        content: [
          { type: 'thinking', thinking: 'Reasoning...' },
          { type: 'text', text: 'I will search.' },
          { type: 'tool_use', name: 'search', input: { q: 'test' } },
          { type: 'text', text: ' Then read.' },
          { type: 'tool_use', name: 'read', input: { path: '/' } },
        ],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('I will search. Then read.');
      expect(result.toolCalls).toHaveLength(2);
      expect(result.thinkingContent).toBe('Reasoning...');
    });

    it('handles empty content array', () => {
      const output = { content: [], stop_reason: 'end_turn' };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles plain string response', () => {
      const result = adapter.parseResponse('Hello world', traceId);
      expect(result.response).toBe('Hello world');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles stop_reason tool_use with no tool_use blocks (defensive)', () => {
      const output = {
        content: [{ type: 'text', text: 'No tools here.' }],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.response).toBe('No tools here.');
      expect(result.toolCalls).toEqual([]);
    });

    it('returns text fallback on null output', () => {
      const result = adapter.parseResponse(null, traceId);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('returns text fallback on undefined output', () => {
      const result = adapter.parseResponse(undefined, traceId);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('detects OpenUI content type in response', () => {
      const output = {
        content: [{ type: 'text', text: '<StatusCard title="Test" />' }],
        stop_reason: 'end_turn',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.contentType).toBe('openui');
    });

    it('handles tool_use with missing input', () => {
      const output = {
        content: [{ type: 'tool_use', name: 'noop' }],
        stop_reason: 'tool_use',
      };
      const result = adapter.parseResponse(output, traceId);
      expect(result.toolCalls).toEqual([{ name: 'noop', params: {} }]);
    });

    it('returns text-mode fallback for empty string input', () => {
      expect(() => adapter.parseResponse('', traceId)).not.toThrow();
      const result = adapter.parseResponse('', traceId);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('returns text-mode fallback for unexpected object input', () => {
      expect(() => adapter.parseResponse({ unexpected: true }, traceId)).not.toThrow();
      const result = adapter.parseResponse({ unexpected: true }, traceId);
      expect(typeof result.response).toBe('string');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('never throws on malformed output', () => {
      expect(() => adapter.parseResponse({ content: 'not-an-array' }, traceId)).not.toThrow();
      expect(() => adapter.parseResponse(42, traceId)).not.toThrow();
      expect(() => adapter.parseResponse({ content: [null, undefined, 123] }, traceId)).not.toThrow();
    });
  });
});
