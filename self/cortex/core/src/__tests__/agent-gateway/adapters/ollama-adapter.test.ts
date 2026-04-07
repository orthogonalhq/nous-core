import { describe, expect, it } from 'vitest';
import {
  createOllamaAdapter,
  isToolCapableModel,
} from '../../../agent-gateway/adapters/ollama-adapter.js';
import type { TraceId, ToolDefinition, GatewayContextFrame } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440200' as TraceId;

const SAMPLE_TOOL: ToolDefinition = {
  name: 'get_weather',
  version: '1.0.0',
  description: 'Get weather for a city',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
  outputSchema: {},
  capabilities: ['read'],
  permissionScope: 'project',
};

function makeFrame(
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
): GatewayContextFrame {
  return {
    role,
    source: 'model_output',
    content,
    createdAt: new Date().toISOString(),
  };
}

// ── isToolCapableModel ────────────────────────────────────────────────────────

describe('isToolCapableModel', () => {
  it.each([
    ['gemma4:12b', true],
    ['gemma4', true],
    ['qwen2.5:7b', true],
    ['qwen3:14b', true],
    ['qwen:1.5b', true],
    ['llama3.1:8b', true],
    ['llama3.2:3b', true],
    ['llama3.3:70b', true],
    ['mistral:7b', true],
    ['Gemma4:12B', true],  // case insensitive
    ['QWEN3:14B', true],
  ])('returns true for tool-capable model: %s', (modelId, expected) => {
    expect(isToolCapableModel(modelId)).toBe(expected);
  });

  it.each([
    ['phi3:mini', false],
    ['codellama:7b', false],
    ['deepseek-coder:6.7b', false],
    ['llama2:7b', false],
    ['llama3:8b', false],  // llama3 (not 3.1/3.2/3.3) is not in the list
    ['vicuna:7b', false],
    ['unknown-model', false],
    ['', false],
  ])('returns false for non-tool-capable model: %s', (modelId, expected) => {
    expect(isToolCapableModel(modelId)).toBe(expected);
  });
});

// ── createOllamaAdapter ───────────────────────────────────────────────────────

describe('createOllamaAdapter', () => {
  describe('capabilities', () => {
    it('reports nativeToolUse true for tool-capable model', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      expect(adapter.capabilities.nativeToolUse).toBe(true);
    });

    it('reports nativeToolUse false for non-capable model', () => {
      const adapter = createOllamaAdapter('phi3:mini');
      expect(adapter.capabilities.nativeToolUse).toBe(false);
    });

    it('defaults to tool-capable when no modelId provided', () => {
      const adapter = createOllamaAdapter();
      expect(adapter.capabilities.nativeToolUse).toBe(true);
    });

    it('has cacheControl false and extendedThinking true', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      expect(adapter.capabilities.cacheControl).toBe(false);
      expect(adapter.capabilities.extendedThinking).toBe(true);
      expect(adapter.capabilities.streaming).toBe(true);
    });
  });

  describe('formatRequest', () => {
    it('builds messages array with system prompt first', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'You are helpful.',
        context: [makeFrame('user', 'Hello')],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('joins string[] systemPrompt into single string', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: ['Part A.', 'Part B.'],
        context: [],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<{ role: string; content: string }>;
      expect(messages[0].content).toBe('Part A.\n\nPart B.');
    });

    it('includes tools in OpenAI-compatible format for tool-capable model', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        toolDefinitions: [SAMPLE_TOOL],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather for a city',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        },
      ]);
    });

    it('sets stream: false when tools are present (streaming gotcha)', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        toolDefinitions: [SAMPLE_TOOL],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.stream).toBe(false);
    });

    it('does NOT set stream when no tools are present', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.stream).toBeUndefined();
    });

    it('does NOT include tools for non-capable model (text-listed fallback)', () => {
      const adapter = createOllamaAdapter('phi3:mini');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        toolDefinitions: [SAMPLE_TOOL],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.tools).toBeUndefined();
      expect(input.stream).toBeUndefined();
    });

    it('does not include tools when toolDefinitions is empty array', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        toolDefinitions: [],
      });
      const input = result.input as Record<string, unknown>;
      expect(input.tools).toBeUndefined();
    });

    it('strips thinking blocks from assistant messages in context', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          makeFrame('user', 'What is 2+2?'),
          makeFrame('assistant', '<think>Let me calculate...</think>The answer is 4.'),
          makeFrame('user', 'And 3+3?'),
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<{ role: string; content: string }>;
      // Assistant message should have thinking stripped
      expect(messages[2].content).toBe('The answer is 4.');
      // User messages should be untouched
      expect(messages[1].content).toBe('What is 2+2?');
    });

    it('includes model_profile from modelRequirements', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [],
        modelRequirements: { profile: 'review-standard', fallbackPolicy: 'block_if_unmet' },
      });
      const input = result.input as Record<string, unknown>;
      expect(input.model_profile).toBe('review-standard');
    });
  });

  describe('parseResponse', () => {
    const adapter = createOllamaAdapter('gemma4:12b');

    it('parses plain text response', () => {
      const result = adapter.parseResponse('Hello world', TRACE_ID);
      expect(result.response).toBe('Hello world');
      expect(result.toolCalls).toEqual([]);
      expect(result.contentType).toBe('text');
    });

    it('parses message object with tool_calls', () => {
      const output = {
        content: '',
        tool_calls: [
          {
            function: {
              name: 'get_weather',
              arguments: { city: 'NYC' },
            },
          },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([
        { name: 'get_weather', params: { city: 'NYC' } },
      ]);
    });

    it('parses tool_calls with string arguments (JSON)', () => {
      const output = {
        content: '',
        tool_calls: [
          {
            function: {
              name: 'get_weather',
              arguments: '{"city":"NYC"}',
            },
          },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([
        { name: 'get_weather', params: { city: 'NYC' } },
      ]);
    });

    it('parses multiple tool_calls', () => {
      const output = {
        content: '',
        tool_calls: [
          { function: { name: 'tool_a', arguments: { x: 1 } } },
          { function: { name: 'tool_b', arguments: { y: 2 } } },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('tool_a');
      expect(result.toolCalls[1].name).toBe('tool_b');
    });

    it('parses thinking content from thinking field (Gemma 4)', () => {
      const output = {
        content: 'The answer is 4.',
        thinking: 'Let me calculate 2+2. That equals 4.',
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('The answer is 4.');
      expect(result.thinkingContent).toBe('Let me calculate 2+2. That equals 4.');
    });

    it('parses thinking content from <think> tags (Qwen style)', () => {
      const output = '<think>Let me reason about this.</think>The answer is yes.';
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('The answer is yes.');
      expect(result.thinkingContent).toBe('Let me reason about this.');
    });

    it('parses multiple <think> blocks', () => {
      const output = '<think>Step 1</think>Partial. <think>Step 2</think>Final answer.';
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('Partial. Final answer.');
      expect(result.thinkingContent).toBe('Step 1\n\nStep 2');
    });

    it('prefers thinking field over <think> tags', () => {
      const output = {
        content: '<think>In-content reasoning</think>The answer.',
        thinking: 'Field-level reasoning',
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      // thinking field takes priority, content is NOT stripped of <think> tags
      // because we use the field-level thinking
      expect(result.thinkingContent).toBe('Field-level reasoning');
    });

    it('detects OpenUI content type', () => {
      const output = { content: '<StatusCard title="test" />' };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.contentType).toBe('openui');
    });

    it('handles null input gracefully', () => {
      const result = adapter.parseResponse(null, TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles undefined input gracefully', () => {
      const result = adapter.parseResponse(undefined, TRACE_ID);
      expect(result.response).toBe('');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles numeric input gracefully', () => {
      const result = adapter.parseResponse(42, TRACE_ID);
      expect(result.response).toBe('42');
      expect(result.toolCalls).toEqual([]);
    });

    it('handles tool_calls with invalid JSON string arguments', () => {
      const output = {
        content: '',
        tool_calls: [
          { function: { name: 'broken', arguments: 'not-json' } },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([{ name: 'broken', params: {} }]);
    });

    it('handles empty tool_calls array (done_reason: tool_calls edge case)', () => {
      const output = {
        content: 'No actual tool calls',
        tool_calls: [],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([]);
      expect(result.response).toBe('No actual tool calls');
    });

    it('handles tool_calls with content alongside', () => {
      const output = {
        content: 'I will check the weather.',
        tool_calls: [
          { function: { name: 'get_weather', arguments: { city: 'NYC' } } },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.response).toBe('I will check the weather.');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('skips malformed tool_calls entries', () => {
      const output = {
        content: '',
        tool_calls: [
          { function: { name: 'valid', arguments: {} } },
          { noFunction: true },
          { function: { noName: true } },
          null,
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([{ name: 'valid', params: {} }]);
    });

    it('returns empty thinkingContent for empty thinking field', () => {
      const output = {
        content: 'Response',
        thinking: '   ',
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.thinkingContent).toBeUndefined();
    });
  });
});

// ── Regression: non-capable models get text-listed behavior ───────────────────

describe('Ollama adapter regression — text-listed fallback', () => {
  it('non-capable model adapter ignores toolDefinitions in formatRequest', () => {
    const adapter = createOllamaAdapter('phi3:mini');
    const result = adapter.formatRequest({
      systemPrompt: 'You are a helpful assistant.',
      context: [makeFrame('user', 'Hello')],
      toolDefinitions: [SAMPLE_TOOL],
    });
    const input = result.input as Record<string, unknown>;
    // Tools should NOT be in the request body — they are text-listed in the prompt
    expect(input.tools).toBeUndefined();
    // Messages should still be present
    expect(input.messages).toBeDefined();
  });

  it('non-capable model still parses plain text responses correctly', () => {
    const adapter = createOllamaAdapter('phi3:mini');
    const result = adapter.parseResponse('Just a text response', TRACE_ID);
    expect(result.response).toBe('Just a text response');
    expect(result.toolCalls).toEqual([]);
  });
});
