/**
 * formatTools defensive injection — WR-148 phase 1.1 / T5b
 *
 * Tier 2 behavior test: validates that the Anthropic adapter's formatTools
 * function defensively injects `type: "object"` for tools with missing type
 * fields, logs when injection occurs, and does not mutate original schemas.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createAnthropicAdapter } from '../../../agent-gateway/adapters/anthropic-adapter.js';
import type { ToolDefinition, GatewayContextFrame } from '@nous/shared';

function makeToolDefinition(
  name: string,
  inputSchema: Record<string, unknown>,
): ToolDefinition {
  return {
    name,
    version: '1.0.0',
    description: `Test tool: ${name}`,
    inputSchema,
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
  };
}

/**
 * Exercise formatTools indirectly through the adapter's formatRequest.
 * Returns the `tools` array from the formatted request.
 */
function formatToolsViaAdapter(
  toolDefinitions: readonly ToolDefinition[],
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  const adapter = createAnthropicAdapter();
  const context: GatewayContextFrame[] = [
    { role: 'user', source: 'runtime', content: 'test', createdAt: new Date().toISOString() },
  ];
  const result = adapter.formatRequest({
    systemPrompt: 'test',
    context,
    toolDefinitions,
  });
  return (result.input as Record<string, unknown>).tools as Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
}

describe('formatTools defensive injection (WR-148 phase 1.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes through a valid schema unchanged', () => {
    const schema = {
      type: 'object',
      properties: { mode: { type: 'string' } },
      required: ['mode'],
    };
    const tools = formatToolsViaAdapter([makeToolDefinition('valid_tool', schema)]);
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema).toEqual(schema);
  });

  it('injects type: "object" when inputSchema is empty ({})', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const tools = formatToolsViaAdapter([makeToolDefinition('empty_schema', {})]);
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.type).toBe('object');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Injecting type:"object" for tool "empty_schema"'),
    );
  });

  it('injects type: "object" when inputSchema has properties but no type', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const schema = {
      properties: { mode: { type: 'string' } },
      required: ['mode'],
    };
    const tools = formatToolsViaAdapter([makeToolDefinition('no_type_tool', schema)]);
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.type).toBe('object');
    expect(tools[0].input_schema.properties).toEqual({ mode: { type: 'string' } });
    expect(tools[0].input_schema.required).toEqual(['mode']);
    expect(spy).toHaveBeenCalled();
  });

  it('does not log when schema already has a type field', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const schema = { type: 'object', properties: {} };
    formatToolsViaAdapter([makeToolDefinition('typed_tool', schema)]);
    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('Injecting type:"object"'),
    );
  });

  it('does not mutate the original schema object (uses spread)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const originalSchema: Record<string, unknown> = {
      properties: { mode: { type: 'string' } },
    };
    const originalRef = originalSchema;
    formatToolsViaAdapter([makeToolDefinition('no_mutate', originalSchema)]);
    // The original schema should NOT have type added
    expect(originalRef.type).toBeUndefined();
  });
});
