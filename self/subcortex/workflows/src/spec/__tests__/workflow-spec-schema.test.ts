/**
 * Tests for WorkflowSpec Zod schemas and validation.
 */
import { describe, it, expect } from 'vitest';
import {
  WorkflowSpecSchema,
  WorkflowNodeSchema,
  WorkflowConnectionSchema,
  validateWorkflowSpec,
  type WorkflowSpec,
} from '@nous/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validMinimalSpec: WorkflowSpec = {
  name: 'Minimal Workflow',
  version: 1,
  nodes: [
    {
      id: 'start',
      name: 'Start',
      type: 'nous.trigger.webhook',
      position: [0, 0],
      parameters: { path: '/hook' },
    },
  ],
  connections: [],
};

const validLinearSpec: WorkflowSpec = {
  name: 'Linear Workflow',
  version: 1,
  nodes: [
    {
      id: 'trigger',
      name: 'Schedule Trigger',
      type: 'nous.trigger.schedule',
      position: [0, 0],
      parameters: { cron: '0 * * * *' },
    },
    {
      id: 'agent',
      name: 'Claude Agent',
      type: 'nous.agent.claude',
      position: [200, 0],
      parameters: { model: 'claude-3-opus' },
    },
    {
      id: 'save',
      name: 'Save to Memory',
      type: 'nous.memory.write',
      position: [400, 0],
      parameters: { key: 'result', value: '{{agent.output}}' },
    },
  ],
  connections: [
    { from: 'trigger', to: 'agent' },
    { from: 'agent', to: 'save' },
  ],
};

const validConditionalSpec: WorkflowSpec = {
  name: 'Conditional Workflow',
  version: 1,
  nodes: [
    {
      id: 'trigger',
      name: 'Webhook',
      type: 'nous.trigger.webhook',
      position: [0, 0],
      parameters: { path: '/decide' },
    },
    {
      id: 'check',
      name: 'Check Condition',
      type: 'nous.condition.if',
      position: [200, 0],
      parameters: { expression: 'data.score > 0.8' },
    },
    {
      id: 'accept',
      name: 'Accept',
      type: 'nous.agent.claude',
      position: [400, -100],
      parameters: {},
    },
    {
      id: 'reject',
      name: 'Reject',
      type: 'nous.agent.claude',
      position: [400, 100],
      parameters: {},
    },
  ],
  connections: [
    { from: 'trigger', to: 'check' },
    { from: 'check', to: 'accept', output: true },
    { from: 'check', to: 'reject', output: false },
  ],
};

// ---------------------------------------------------------------------------
// WorkflowNodeSchema tests
// ---------------------------------------------------------------------------

describe('WorkflowNodeSchema', () => {
  it('accepts a valid node', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'My Node',
      type: 'nous.agent.claude',
      position: [100, 200],
      parameters: { model: 'claude-3-opus' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults parameters to empty object', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'My Node',
      type: 'nous.trigger.schedule',
      position: [0, 0],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parameters).toEqual({});
    }
  });

  it('rejects invalid node type format', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'Bad Type',
      type: 'invalid.type',
      position: [0, 0],
    });
    expect(result.success).toBe(false);
  });

  it('rejects node type without action segment', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'No Action',
      type: 'nous.trigger',
      position: [0, 0],
    });
    expect(result.success).toBe(false);
  });

  it('rejects node type with unknown category', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'Unknown',
      type: 'nous.unknown.action',
      position: [0, 0],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty id', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: '',
      name: 'Empty ID',
      type: 'nous.trigger.schedule',
      position: [0, 0],
    });
    expect(result.success).toBe(false);
  });

  it('rejects position with wrong length', () => {
    const result = WorkflowNodeSchema.safeParse({
      id: 'node-1',
      name: 'Bad Pos',
      type: 'nous.trigger.schedule',
      position: [0],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WorkflowConnectionSchema tests
// ---------------------------------------------------------------------------

describe('WorkflowConnectionSchema', () => {
  it('accepts a basic connection', () => {
    const result = WorkflowConnectionSchema.safeParse({
      from: 'a',
      to: 'b',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a connection with boolean output', () => {
    const result = WorkflowConnectionSchema.safeParse({
      from: 'a',
      to: 'b',
      output: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a connection with string output', () => {
    const result = WorkflowConnectionSchema.safeParse({
      from: 'a',
      to: 'b',
      output: 'case-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty from', () => {
    const result = WorkflowConnectionSchema.safeParse({
      from: '',
      to: 'b',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WorkflowSpecSchema tests
// ---------------------------------------------------------------------------

describe('WorkflowSpecSchema', () => {
  it('accepts a minimal valid spec', () => {
    const result = WorkflowSpecSchema.safeParse(validMinimalSpec);
    expect(result.success).toBe(true);
  });

  it('accepts a linear workflow spec', () => {
    const result = WorkflowSpecSchema.safeParse(validLinearSpec);
    expect(result.success).toBe(true);
  });

  it('accepts a conditional workflow spec', () => {
    const result = WorkflowSpecSchema.safeParse(validConditionalSpec);
    expect(result.success).toBe(true);
  });

  it('rejects version != 1', () => {
    const result = WorkflowSpecSchema.safeParse({
      ...validMinimalSpec,
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = WorkflowSpecSchema.safeParse({
      ...validMinimalSpec,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty nodes array', () => {
    const result = WorkflowSpecSchema.safeParse({
      ...validMinimalSpec,
      nodes: [],
    });
    expect(result.success).toBe(false);
  });

  it('defaults connections to empty array', () => {
    const { connections: _, ...specWithoutConnections } = validMinimalSpec;
    const result = WorkflowSpecSchema.safeParse(specWithoutConnections);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.connections).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// validateWorkflowSpec tests
// ---------------------------------------------------------------------------

describe('validateWorkflowSpec', () => {
  it('returns success for a valid spec', () => {
    const result = validateWorkflowSpec(validLinearSpec);
    expect(result.success).toBe(true);
  });

  it('catches duplicate node IDs', () => {
    const spec = {
      ...validMinimalSpec,
      nodes: [
        validMinimalSpec.nodes[0]!,
        { ...validMinimalSpec.nodes[0]!, name: 'Duplicate' },
      ],
    };
    const result = validateWorkflowSpec(spec);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.message.includes('Duplicate node id'))).toBe(true);
    }
  });

  it('catches connections referencing non-existent nodes', () => {
    const spec: WorkflowSpec = {
      ...validMinimalSpec,
      connections: [{ from: 'start', to: 'nonexistent' }],
    };
    const result = validateWorkflowSpec(spec);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.errors.some((e) => e.message.includes('non-existent target')),
      ).toBe(true);
    }
  });

  it('catches self-loop connections', () => {
    const spec: WorkflowSpec = {
      ...validMinimalSpec,
      connections: [{ from: 'start', to: 'start' }],
    };
    const result = validateWorkflowSpec(spec);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.message.includes('Self-loop'))).toBe(
        true,
      );
    }
  });

  it('returns schema errors for completely invalid input', () => {
    const result = validateWorkflowSpec({ name: 123 });
    expect(result.success).toBe(false);
  });

  it('returns schema errors for missing required fields', () => {
    const result = validateWorkflowSpec({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
