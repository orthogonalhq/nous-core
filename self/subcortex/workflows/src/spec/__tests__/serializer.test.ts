/**
 * Tests for YAML workflow spec serializer and round-trip.
 */
import { describe, it, expect } from 'vitest';
import { serializeWorkflowSpec } from '../serializer.js';
import { parseWorkflowSpec } from '../parser.js';
import type { WorkflowSpec } from '@nous/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const linearSpec: WorkflowSpec = {
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
      parameters: { model: 'claude-3-opus', temperature: 0.7 },
    },
  ],
  connections: [{ from: 'trigger', to: 'agent' }],
};

const conditionalSpec: WorkflowSpec = {
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
      name: 'Check',
      type: 'nous.condition.if',
      position: [200, 0],
      parameters: { expression: 'data.ok' },
    },
    {
      id: 'yes',
      name: 'Yes Branch',
      type: 'nous.agent.claude',
      position: [400, -100],
      parameters: {},
    },
    {
      id: 'no',
      name: 'No Branch',
      type: 'nous.agent.claude',
      position: [400, 100],
      parameters: {},
    },
  ],
  connections: [
    { from: 'trigger', to: 'check' },
    { from: 'check', to: 'yes', output: true },
    { from: 'check', to: 'no', output: false },
  ],
};

const noParamsSpec: WorkflowSpec = {
  name: 'No Params',
  version: 1,
  nodes: [
    {
      id: 'start',
      name: 'Start',
      type: 'nous.trigger.webhook',
      position: [0, 0],
      parameters: {},
    },
  ],
  connections: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('serializeWorkflowSpec', () => {
  it('serializes a linear workflow to valid YAML', () => {
    const yaml = serializeWorkflowSpec(linearSpec);
    expect(typeof yaml).toBe('string');
    expect(yaml).toContain('name: Linear Workflow');
    expect(yaml).toContain('version: 1');
    expect(yaml).toContain('nous.trigger.schedule');
    expect(yaml).toContain('nous.agent.claude');
  });

  it('serializes a conditional workflow with output fields', () => {
    const yaml = serializeWorkflowSpec(conditionalSpec);
    expect(yaml).toContain('output: true');
    expect(yaml).toContain('output: false');
  });

  it('omits parameters key when parameters are empty', () => {
    const yaml = serializeWorkflowSpec(noParamsSpec);
    expect(yaml).not.toContain('parameters');
  });

  it('respects custom indent option', () => {
    const yaml = serializeWorkflowSpec(linearSpec, { indent: 4 });
    // The YAML library uses the indent for nested block mappings
    // With indent: 4, nested properties under list items get deeper indentation
    expect(yaml).toContain('      name: Schedule Trigger');
  });
});

describe('serialize -> parse round-trip', () => {
  it('round-trips a linear workflow', () => {
    const yaml = serializeWorkflowSpec(linearSpec);
    const result = parseWorkflowSpec(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(linearSpec.name);
      expect(result.data.version).toBe(linearSpec.version);
      expect(result.data.nodes).toHaveLength(linearSpec.nodes.length);
      expect(result.data.connections).toHaveLength(linearSpec.connections.length);

      for (let i = 0; i < linearSpec.nodes.length; i++) {
        expect(result.data.nodes[i]!.id).toBe(linearSpec.nodes[i]!.id);
        expect(result.data.nodes[i]!.name).toBe(linearSpec.nodes[i]!.name);
        expect(result.data.nodes[i]!.type).toBe(linearSpec.nodes[i]!.type);
        expect(result.data.nodes[i]!.position).toEqual(
          linearSpec.nodes[i]!.position,
        );
      }
    }
  });

  it('round-trips a conditional workflow preserving output fields', () => {
    const yaml = serializeWorkflowSpec(conditionalSpec);
    const result = parseWorkflowSpec(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      const trueConn = result.data.connections.find((c) => c.output === true);
      const falseConn = result.data.connections.find((c) => c.output === false);
      expect(trueConn).toBeDefined();
      expect(falseConn).toBeDefined();
    }
  });

  it('round-trips a spec with no parameters', () => {
    const yaml = serializeWorkflowSpec(noParamsSpec);
    const result = parseWorkflowSpec(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0]!.parameters).toEqual({});
    }
  });
});
