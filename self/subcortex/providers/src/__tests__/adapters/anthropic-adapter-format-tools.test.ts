/**
 * formatTools defensive injection.
 *
 * Tier 2 behavior test: validates that the Anthropic adapter's formatTools
 * function defensively injects `type: "object"` for tools with missing type
 * fields, logs when injection occurs, and does not mutate original schemas.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createAnthropicAdapter } from '../../providers/anthropic/adapter.js';
import type { ToolDefinition, GatewayContextFrame, ILogChannel } from '@nous/shared';

function createMockLog(): ILogChannel {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isEnabled: () => true,
  };
}

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
  log?: ILogChannel,
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  const adapter = createAnthropicAdapter(log);
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

describe('formatTools defensive injection', () => {
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
    const log = createMockLog();
    const tools = formatToolsViaAdapter([makeToolDefinition('empty_schema', {})], log);
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.type).toBe('object');
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('Injecting type:"object" for tool "empty_schema"'),
    );
  });

  it('injects type: "object" when inputSchema has properties but no type', () => {
    const log = createMockLog();
    const schema = {
      properties: { mode: { type: 'string' } },
      required: ['mode'],
    };
    const tools = formatToolsViaAdapter([makeToolDefinition('no_type_tool', schema)], log);
    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.type).toBe('object');
    expect(tools[0].input_schema.properties).toEqual({ mode: { type: 'string' } });
    expect(tools[0].input_schema.required).toEqual(['mode']);
    expect(log.info).toHaveBeenCalled();
  });

  it('does not log when schema already has a type field', () => {
    const log = createMockLog();
    const schema = { type: 'object', properties: {} };
    formatToolsViaAdapter([makeToolDefinition('typed_tool', schema)], log);
    expect(log.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Injecting type:"object"'),
    );
  });

  it('does not mutate the original schema object (uses spread)', () => {
    const log = createMockLog();
    const originalSchema: Record<string, unknown> = {
      properties: { mode: { type: 'string' } },
    };
    const originalRef = originalSchema;
    formatToolsViaAdapter([makeToolDefinition('no_mutate', originalSchema)], log);
    // The original schema should NOT have type added
    expect(originalRef.type).toBeUndefined();
  });

  it('flattens top-level oneOf because Anthropic rejects top-level schema combinators', () => {
    const log = createMockLog();
    const schema: Record<string, unknown> = {
      type: 'object',
      oneOf: [
        {
          properties: {
            mode: { const: 'read', description: 'Substring search mode' },
            query: { type: 'string', minLength: 1 },
            scope: { enum: ['global', 'project'] },
          },
          required: ['mode', 'query', 'scope'],
          additionalProperties: false,
        },
        {
          properties: {
            mode: { const: 'retrieve', description: 'Situation-driven recall mode' },
            situation: { type: 'string', minLength: 1 },
            budget: { type: 'integer', minimum: 1 },
          },
          required: ['mode', 'situation', 'budget'],
          additionalProperties: false,
        },
      ],
    };

    const tools = formatToolsViaAdapter([makeToolDefinition('memory_search', schema)], log);

    expect(tools).toHaveLength(1);
    expect(tools[0].input_schema.oneOf).toBeUndefined();
    expect(tools[0].input_schema.type).toBe('object');
    expect(tools[0].input_schema.required).toEqual(['mode']);
    expect(tools[0].input_schema.properties).toMatchObject({
      mode: { enum: ['read', 'retrieve'] },
      query: { type: 'string', minLength: 1 },
      scope: { enum: ['global', 'project'] },
      situation: { type: 'string', minLength: 1 },
      budget: { type: 'integer', minimum: 1 },
    });
    expect(schema.oneOf).toBeDefined();
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining('Flattening top-level JSON Schema combinator for Anthropic tool "memory_search"'),
    );
  });
});
