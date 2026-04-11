/**
 * Anthropic adapter — input_schema normalization tests (WR-148 sub-phase 1.1)
 *
 * Verifies that `formatTools` in the Anthropic adapter guarantees
 * `type: "object"` on every tool's `input_schema`, as required by the
 * Anthropic Messages API. This addresses RC-3/RC-4 from the root cause
 * manifest.
 */
import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../../agent-gateway/adapters/anthropic-adapter.js';
import type { AdapterFormatInput } from '../../../agent-gateway/adapters/types.js';
import type { ToolDefinition } from '@nous/shared';

const adapter = createAnthropicAdapter();

function formatWithTools(tools: ToolDefinition[]) {
  const input: AdapterFormatInput = {
    systemPrompt: 'test',
    context: [],
    toolDefinitions: tools,
  };
  return adapter.formatRequest(input);
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

describe('Anthropic adapter — input_schema normalization (WR-148)', () => {
  it('injects type: "object" when source schema has no type field', () => {
    const tool = makeTool({ projectId: 'ProjectId?', status: 'WorkflowRunStatus[]?' });
    const result = formatWithTools([tool]);

    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.input_schema.type).toBe('object');
    // Original fields are preserved
    expect(formatted[0]!.input_schema.projectId).toBe('ProjectId?');
    expect(formatted[0]!.input_schema.status).toBe('WorkflowRunStatus[]?');
  });

  it('preserves existing type: "object" without double-wrapping', () => {
    const tool = makeTool({
      type: 'object',
      properties: { query: { type: 'string' } },
    });
    const result = formatWithTools([tool]);

    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.input_schema.type).toBe('object');
    expect(formatted[0]!.input_schema.properties).toEqual({ query: { type: 'string' } });
    // Should NOT have a nested type: "object" from double-injection
    expect(Object.keys(formatted[0]!.input_schema)).toEqual(['type', 'properties']);
  });

  it('does not overwrite a non-"object" type value', () => {
    const tool = makeTool({
      type: 'array',
      items: { type: 'string' },
    });
    const result = formatWithTools([tool]);

    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.input_schema.type).toBe('array');
    expect(formatted[0]!.input_schema.items).toEqual({ type: 'string' });
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

    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.input_schema).toEqual({ type: 'object' });
  });

  it('handles empty object inputSchema — produces { type: "object" }', () => {
    const tool = makeTool({});
    const result = formatWithTools([tool]);

    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.input_schema).toEqual({ type: 'object' });
  });

  it('normalizes all tools in a multi-tool request', () => {
    const tools: ToolDefinition[] = [
      makeTool({ projectId: 'string' }),
      makeTool({ type: 'object', properties: {} }),
      makeTool({}),
    ];
    // Give unique names
    tools[0]!.name = 'tool_a';
    tools[1]!.name = 'tool_b';
    tools[2]!.name = 'tool_c';

    const result = formatWithTools(tools);
    const formatted = result.input.tools as Array<{ input_schema: Record<string, unknown> }>;

    expect(formatted).toHaveLength(3);
    expect(formatted[0]!.input_schema.type).toBe('object');
    expect(formatted[1]!.input_schema.type).toBe('object');
    expect(formatted[2]!.input_schema.type).toBe('object');
  });
});
