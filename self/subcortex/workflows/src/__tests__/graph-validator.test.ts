import { describe, it, expect } from 'vitest';
import { validateWorkflowDefinition } from '../graph-validator.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440101';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440102';
const NODE_A = '550e8400-e29b-41d4-a716-446655440103';
const NODE_B = '550e8400-e29b-41d4-a716-446655440104';
const NODE_C = '550e8400-e29b-41d4-a716-446655440105';
const EDGE_A_B = '550e8400-e29b-41d4-a716-446655440106';
const EDGE_B_C = '550e8400-e29b-41d4-a716-446655440107';
const EDGE_C_B = '550e8400-e29b-41d4-a716-446655440108';

const baseDefinition = () =>
  ({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid' as const,
  version: '1.0.0',
  name: 'Validation Workflow',
  entryNodeIds: [NODE_A],
  nodes: [
    {
      id: NODE_A,
      name: 'A',
      type: 'model-call' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
    {
      id: NODE_B,
      name: 'B',
      type: 'quality-gate' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
    {
      id: NODE_C,
      name: 'C',
      type: 'transform' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
  ],
  edges: [
    { id: EDGE_A_B, from: NODE_A, to: NODE_B, priority: 0 },
    { id: EDGE_B_C, from: NODE_B, to: NODE_C, priority: 0 },
  ],
}) as any;

describe('validateWorkflowDefinition', () => {
  it('accepts a valid DAG definition', () => {
    const result = validateWorkflowDefinition(baseDefinition());
    expect(result.valid).toBe(true);
  });

  it('rejects cycles', () => {
    const result = validateWorkflowDefinition({
      ...baseDefinition(),
      edges: [
        ...baseDefinition().edges,
        { id: EDGE_C_B, from: NODE_C, to: NODE_B, priority: 0 },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some((issue) => issue.code === 'workflow_cycle_detected'),
      ).toBe(true);
    }
  });

  it('rejects dangling edges', () => {
    const result = validateWorkflowDefinition({
      ...baseDefinition(),
      edges: [
        { id: EDGE_A_B, from: NODE_A, to: '550e8400-e29b-41d4-a716-446655440199', priority: 0 },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.some((issue) => issue.code === 'workflow_dangling_edge')).toBe(
        true,
      );
    }
  });

  it('rejects duplicate node ids', () => {
    const definition = baseDefinition();
    const result = validateWorkflowDefinition({
      ...definition,
      nodes: [...definition.nodes, definition.nodes[0]],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some((issue) => issue.code === 'workflow_duplicate_node_id'),
      ).toBe(true);
    }
  });
});
