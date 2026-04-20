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

    it('emits tool result message for tool frame with metadata.tool_call_id', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          {
            role: 'tool' as const,
            content: 'weather data',
            source: 'tool_result' as const,
            createdAt: new Date().toISOString(),
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
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [makeFrame('tool', 'tool output')],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({ role: 'user', content: 'tool output' });
    });

    it('SP 1.15 RC-3 — includes `name` on tool result message when frame.name is set', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          {
            role: 'tool' as const,
            content: 'workflow listing',
            source: 'tool_result' as const,
            createdAt: new Date().toISOString(),
            name: 'workflow_list',
            metadata: { tool_call_id: 'call_xyz' },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({
        role: 'tool',
        content: 'workflow listing',
        tool_call_id: 'call_xyz',
        name: 'workflow_list',
      });
    });

    it('SP 1.15 RC-3 — backwards-compat regression: omits `name` when frame.name is undefined', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          {
            role: 'tool' as const,
            content: 'no-name result',
            source: 'tool_result' as const,
            createdAt: new Date().toISOString(),
            metadata: { tool_call_id: 'call_xyz' },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({
        role: 'tool',
        content: 'no-name result',
        tool_call_id: 'call_xyz',
      });
      expect(messages[1]).not.toHaveProperty('name');
    });

    it('emits tool_calls array on assistant message with metadata.tool_calls', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          {
            role: 'assistant' as const,
            content: 'I will check the weather.',
            source: 'model_output' as const,
            createdAt: new Date().toISOString(),
            metadata: {
              tool_calls: [
                { id: 'call_abc', name: 'get_weather', input: { city: 'NYC' } },
              ],
            },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({
        role: 'assistant',
        content: 'I will check the weather.',
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: { city: 'NYC' },
            },
          },
        ],
      });
    });

    it('strips thinking from assistant content even when tool_calls present', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          {
            role: 'assistant' as const,
            content: '<think>Let me reason...</think>I will check.',
            source: 'model_output' as const,
            createdAt: new Date().toISOString(),
            metadata: {
              tool_calls: [
                { id: 'call_1', name: 'get_weather', input: { city: 'NYC' } },
              ],
            },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1].content).toBe('I will check.');
      expect(messages[1].tool_calls).toBeDefined();
    });

    it('formats multi-turn tool calling sequence', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [
          makeFrame('user', 'What is the weather?'),
          {
            role: 'assistant' as const,
            content: 'Let me check.',
            source: 'model_output' as const,
            createdAt: new Date().toISOString(),
            metadata: {
              tool_calls: [
                { id: 'call_w', name: 'get_weather', input: { city: 'NYC' } },
              ],
            },
          },
          {
            role: 'tool' as const,
            content: '72°F and sunny',
            source: 'tool_result' as const,
            createdAt: new Date().toISOString(),
            metadata: { tool_call_id: 'call_w' },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      // system + user + assistant(tool_calls) + tool(tool_call_id)
      expect(messages).toHaveLength(4);
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'Let me check.',
        tool_calls: [{
          id: 'call_w',
          type: 'function',
          function: { name: 'get_weather', arguments: { city: 'NYC' } },
        }],
      });
      expect(messages[3]).toEqual({
        role: 'tool',
        content: '72°F and sunny',
        tool_call_id: 'call_w',
      });
    });

    it('BT R4 RC-1 regression — arguments passed as object (Ollama /api/chat wire format)', () => {
      // Regression test for BT R4 RC-1 (WR-159 phase 1.12).
      //
      // Ollama's NATIVE /api/chat endpoint decodes tool_calls[].function.arguments
      // via the Go ToolCallFunctionArguments.UnmarshalJSON which expects a JSON
      // OBJECT (orderedmap-backed map[string]any), NOT a JSON-string-of-an-object.
      // See ollama/ollama:main api/types.go lines 240-249 (ToolCallFunctionArguments
      // declaration) and 307-310 (UnmarshalJSON via json.Unmarshal into orderedmap).
      //
      // Pre-fix, ollama-adapter.ts:269 wrapped tc.input in JSON.stringify, which
      // produced a string-shaped value Ollama's parser rejected with HTTP 400
      // "Value looks like object, but can't find closing '}' symbol".
      // BT R4 turn 3 evidence: .worklog/sprints/feat/chat-experience-quality/phase-1/behavioral-testing/round-4.mdx
      //
      // Positive assertion: arguments deep-equals the expected object.
      // Negative assertion: arguments is NOT a string. The negative assertion
      // catches future naive refactors that re-introduce stringification.
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'p',
        context: [
          {
            role: 'assistant' as const,
            content: 'Let me check.',
            source: 'model_output' as const,
            createdAt: new Date().toISOString(),
            metadata: {
              tool_calls: [
                { id: 'call_x', name: 'workflow_list', input: { projectId: 'p1' } },
              ],
            },
          },
          {
            role: 'tool' as const,
            content: 'tool result content',
            source: 'tool_result' as const,
            createdAt: new Date().toISOString(),
            metadata: { tool_call_id: 'call_x' },
          },
        ],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      // system + assistant(tool_calls) + tool(tool_call_id) — three messages.
      const assistantMsg = messages[1] as Record<string, unknown>;
      const toolCalls = assistantMsg.tool_calls as Array<Record<string, unknown>>;
      const fn = toolCalls[0].function as Record<string, unknown>;
      // Positive: arguments is the exact object the gateway provided.
      expect(fn.arguments).toEqual({ projectId: 'p1' });
      // Negative: arguments is NOT a string (catches future refactors that
      // re-introduce JSON.stringify).
      expect(typeof fn.arguments).not.toBe('string');
    });

    it('does not emit tool_calls for assistant frame without metadata.tool_calls', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const result = adapter.formatRequest({
        systemPrompt: 'prompt',
        context: [makeFrame('assistant', 'Just a regular message.')],
      });
      const input = result.input as Record<string, unknown>;
      const messages = input.messages as Array<Record<string, unknown>>;
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Just a regular message.' });
      expect(messages[1].tool_calls).toBeUndefined();
    });

    it('parseResponse returns undefined id for tool calls without id field on raw object', () => {
      const adapter = createOllamaAdapter('gemma4:12b');
      const output = {
        content: '',
        tool_calls: [
          { function: { name: 'get_weather', arguments: { city: 'NYC' } } },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls[0].id).toBeUndefined();
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
        { name: 'get_weather', params: { city: 'NYC' }, id: undefined },
      ]);
    });

    it('extracts id from tool call when present', () => {
      const output = {
        content: '',
        tool_calls: [
          {
            id: 'call_abc123',
            function: {
              name: 'get_weather',
              arguments: { city: 'NYC' },
            },
          },
        ],
      };
      const result = adapter.parseResponse(output, TRACE_ID);
      expect(result.toolCalls).toEqual([
        { name: 'get_weather', params: { city: 'NYC' }, id: 'call_abc123' },
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

describe('createOllamaAdapter — formatRequest sets result.think (SP 1.16 RC-α / α7)', () => {
  it('sets result.think === true when extendedThinking capability is true (tool-bearing turn)', () => {
    const adapter = createOllamaAdapter('llama3.2:3b');
    expect(adapter.capabilities.extendedThinking).toBe(true);
    const result = adapter.formatRequest({
      systemPrompt: 'sys',
      context: [makeFrame('user', 'hi')],
      toolDefinitions: [SAMPLE_TOOL],
    });
    expect((result.input as Record<string, unknown>).think).toBe(true);
  });

  it('sets result.think === true on non-tool-bearing turns too (placement OUTSIDE tool block)', () => {
    const adapter = createOllamaAdapter('llama3.2:3b');
    const result = adapter.formatRequest({
      systemPrompt: 'sys',
      context: [makeFrame('user', 'hi')],
      toolDefinitions: [],
    });
    // Load-bearing: the activation must NOT be gated on tool presence.
    expect((result.input as Record<string, unknown>).think).toBe(true);
    // And tools key must not be present when no tools were supplied.
    expect((result.input as Record<string, unknown>).tools).toBeUndefined();
  });
});
