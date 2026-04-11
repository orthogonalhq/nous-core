/**
 * Ollama adapter — parameters normalization tests (WR-148 sub-phase 1.1)
 *
 * Verifies that the Ollama adapter's tool formatting guarantees
 * `type: "object"` on every tool's `parameters` field. This addresses
 * RC-3/RC-4 from the root cause manifest for forward compatibility
 * with strict Ollama API versions.
 */
import { describe, it, expect } from 'vitest';
import { createOllamaAdapter } from '../../../agent-gateway/adapters/ollama-adapter.js';
import type { ToolDefinition, TraceId } from '@nous/shared';

const TRACE_ID = '550e8400-e29b-41d4-a716-446655440200' as TraceId;

// Use a tool-capable model so tools are included in the request
const adapter = createOllamaAdapter('gemma4:12b');

function formatWithTools(tools: ToolDefinition[]) {
  return adapter.formatRequest({
    systemPrompt: 'test',
    context: [],
    toolDefinitions: tools,
  });
}

function makeTool(inputSchema: Record<string, unknown>): ToolDefinition {
  return {
    name: 'test_tool',
    version: '1.0.0',
    description: 'A test tool',
    inputSchema,
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
  };
}

function getToolParams(result: ReturnType<typeof adapter.formatRequest>): Record<string, unknown> {
  const input = result.input as Record<string, unknown>;
  const tools = input.tools as Array<{
    type: string;
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  return tools[0]!.function.parameters;
}

describe('Ollama adapter — parameters normalization (WR-148)', () => {
  it('injects type: "object" when source schema has no type field', () => {
    const tool = makeTool({ projectId: 'ProjectId?', status: 'WorkflowRunStatus[]?' });
    const result = formatWithTools([tool]);
    const params = getToolParams(result);

    expect(params.type).toBe('object');
    // Original fields are preserved
    expect(params.projectId).toBe('ProjectId?');
    expect(params.status).toBe('WorkflowRunStatus[]?');
  });

  it('preserves existing type: "object" without double-wrapping', () => {
    const tool = makeTool({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    const result = formatWithTools([tool]);
    const params = getToolParams(result);

    expect(params.type).toBe('object');
    expect(params.properties).toEqual({ query: { type: 'string' } });
    expect(Object.keys(params)).toEqual(['type', 'properties']);
  });

  it('does not overwrite a non-"object" type value', () => {
    const tool = makeTool({
      type: 'array',
      items: { type: 'string' },
    });
    const result = formatWithTools([tool]);
    const params = getToolParams(result);

    expect(params.type).toBe('array');
    expect(params.items).toEqual({ type: 'string' });
  });

  it('handles null/undefined inputSchema — produces { type: "object" }', () => {
    const tool: ToolDefinition = {
      name: 'no_params',
      version: '1.0.0',
      description: 'Tool with no parameters',
      inputSchema: undefined as any,
      outputSchema: {},
      capabilities: ['read'],
      permissionScope: 'project',
    };
    const result = formatWithTools([tool]);
    const params = getToolParams(result);

    expect(params).toEqual({ type: 'object' });
  });

  it('handles empty object inputSchema — produces { type: "object" }', () => {
    const tool = makeTool({});
    const result = formatWithTools([tool]);
    const params = getToolParams(result);

    expect(params).toEqual({ type: 'object' });
  });

  it('normalizes all tools in a multi-tool request', () => {
    const tools: ToolDefinition[] = [
      makeTool({ projectId: 'string' }),
      makeTool({ type: 'object', properties: {} }),
      makeTool({}),
    ];
    tools[0]!.name = 'tool_a';
    tools[1]!.name = 'tool_b';
    tools[2]!.name = 'tool_c';

    const result = formatWithTools(tools);
    const input = result.input as Record<string, unknown>;
    const formattedTools = input.tools as Array<{
      function: { parameters: Record<string, unknown> };
    }>;

    expect(formattedTools).toHaveLength(3);
    expect(formattedTools[0]!.function.parameters.type).toBe('object');
    expect(formattedTools[1]!.function.parameters.type).toBe('object');
    expect(formattedTools[2]!.function.parameters.type).toBe('object');
  });
});
