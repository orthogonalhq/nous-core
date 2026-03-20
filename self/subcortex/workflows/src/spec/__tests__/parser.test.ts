/**
 * Tests for YAML workflow spec parser.
 */
import { describe, it, expect } from 'vitest';
import { parseWorkflowSpec } from '../parser.js';

// ---------------------------------------------------------------------------
// Fixtures — YAML strings
// ---------------------------------------------------------------------------

const validMinimalYaml = `
name: Minimal Workflow
version: 1
nodes:
  - id: start
    name: Start
    type: nous.trigger.webhook
    position: [0, 0]
    parameters:
      path: /hook
`;

const validLinearYaml = `
name: Linear Workflow
version: 1
nodes:
  - id: trigger
    name: Schedule Trigger
    type: nous.trigger.schedule
    position: [0, 0]
    parameters:
      cron: "0 * * * *"
  - id: agent
    name: Claude Agent
    type: nous.agent.claude
    position: [200, 0]
    parameters:
      model: claude-3-opus
  - id: save
    name: Save to Memory
    type: nous.memory.write
    position: [400, 0]
    parameters:
      key: result
      value: "{{agent.output}}"
connections:
  - from: trigger
    to: agent
  - from: agent
    to: save
`;

const validConditionalYaml = `
name: Conditional Workflow
version: 1
nodes:
  - id: trigger
    name: Webhook
    type: nous.trigger.webhook
    position: [0, 0]
    parameters:
      path: /decide
  - id: check
    name: Check Condition
    type: nous.condition.if
    position: [200, 0]
    parameters:
      expression: "data.score > 0.8"
  - id: accept
    name: Accept
    type: nous.agent.claude
    position: [400, -100]
    parameters: {}
  - id: reject
    name: Reject
    type: nous.agent.claude
    position: [400, 100]
    parameters: {}
connections:
  - from: trigger
    to: check
  - from: check
    to: accept
    output: true
  - from: check
    to: reject
    output: false
`;

const invalidYamlSyntax = `
name: Bad YAML
version: 1
nodes:
  - id: start
    name: "unclosed string
`;

const invalidSchemaYaml = `
name: ""
version: 99
nodes: []
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseWorkflowSpec', () => {
  it('parses a minimal valid YAML spec', () => {
    const result = parseWorkflowSpec(validMinimalYaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Minimal Workflow');
      expect(result.data.version).toBe(1);
      expect(result.data.nodes).toHaveLength(1);
      expect(result.data.nodes[0]!.id).toBe('start');
      expect(result.data.nodes[0]!.type).toBe('nous.trigger.webhook');
      expect(result.data.nodes[0]!.position).toEqual([0, 0]);
      expect(result.data.nodes[0]!.parameters).toEqual({ path: '/hook' });
    }
  });

  it('parses a linear multi-node YAML spec', () => {
    const result = parseWorkflowSpec(validLinearYaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(3);
      expect(result.data.connections).toHaveLength(2);
      expect(result.data.connections[0]!.from).toBe('trigger');
      expect(result.data.connections[0]!.to).toBe('agent');
    }
  });

  it('parses a conditional branching YAML spec', () => {
    const result = parseWorkflowSpec(validConditionalYaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(4);
      expect(result.data.connections).toHaveLength(3);
      const trueConn = result.data.connections.find((c) => c.output === true);
      const falseConn = result.data.connections.find((c) => c.output === false);
      expect(trueConn).toBeDefined();
      expect(trueConn!.from).toBe('check');
      expect(trueConn!.to).toBe('accept');
      expect(falseConn).toBeDefined();
      expect(falseConn!.from).toBe('check');
      expect(falseConn!.to).toBe('reject');
    }
  });

  it('returns YAML syntax errors', () => {
    const result = parseWorkflowSpec(invalidYamlSyntax);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]!.message).toContain('YAML parse error');
    }
  });

  it('returns schema validation errors', () => {
    const result = parseWorkflowSpec(invalidSchemaYaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns structural validation errors for duplicate node IDs', () => {
    const yaml = `
name: Dup Nodes
version: 1
nodes:
  - id: same
    name: First
    type: nous.trigger.webhook
    position: [0, 0]
    parameters:
      path: /a
  - id: same
    name: Second
    type: nous.trigger.webhook
    position: [100, 0]
    parameters:
      path: /b
`;
    const result = parseWorkflowSpec(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.message.includes('Duplicate node id'))).toBe(true);
    }
  });

  it('handles empty string input', () => {
    const result = parseWorkflowSpec('');
    expect(result.success).toBe(false);
  });

  it('handles non-object YAML input', () => {
    const result = parseWorkflowSpec('just a string');
    expect(result.success).toBe(false);
  });
});
