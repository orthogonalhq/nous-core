import { describe, it, expect } from 'vitest';
import { validateWorkflowDefinition } from '../graph-validator.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440101';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440102';
const NODE_A = '550e8400-e29b-41d4-a716-446655440103';
const NODE_B = '550e8400-e29b-41d4-a716-446655440104';
const NODE_C = '550e8400-e29b-41d4-a716-446655440105';
const NODE_D = '550e8400-e29b-41d4-a716-446655440106';
const EDGE_A_B = '550e8400-e29b-41d4-a716-446655440107';
const EDGE_B_C = '550e8400-e29b-41d4-a716-446655440108';
const EDGE_B_D = '550e8400-e29b-41d4-a716-446655440109';
const EDGE_C_B = '550e8400-e29b-41d4-a716-446655440110';

const baseDefinition = () => ({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid' as const,
  version: '1.0.0',
  name: 'Validation Workflow',
  entryNodeIds: [NODE_A],
  nodes: [
    {
      id: NODE_A,
      name: 'Draft',
      type: 'model-call' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {
        type: 'model-call' as const,
        modelRole: 'cortex-chat' as const,
        promptRef: 'prompt://draft',
        outputSchemaRef: 'schema://node-output/draft',
      },
    },
    {
      id: NODE_B,
      name: 'Route',
      type: 'condition' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {
        type: 'condition' as const,
        predicateRef: 'predicate://route',
        trueBranchKey: 'publish',
        falseBranchKey: 'revise',
      },
    },
    {
      id: NODE_C,
      name: 'Publish',
      type: 'quality-gate' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {
        type: 'quality-gate' as const,
        evaluatorRef: 'evaluator://quality',
        passThresholdRef: 'threshold://default',
        failureAction: 'block' as const,
      },
    },
    {
      id: NODE_D,
      name: 'Revise',
      type: 'transform' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {
        type: 'transform' as const,
        transformRef: 'transform://rewrite',
        inputMappingRef: 'mapping://draft',
      },
    },
  ],
  edges: [
    { id: EDGE_A_B, from: NODE_A, to: NODE_B, priority: 0 },
    { id: EDGE_B_C, from: NODE_B, to: NODE_C, branchKey: 'publish', priority: 0 },
    { id: EDGE_B_D, from: NODE_B, to: NODE_D, branchKey: 'revise', priority: 1 },
  ],
});

describe('validateWorkflowDefinition', () => {
  it('accepts a valid DAG definition with condition branches', () => {
    const result = validateWorkflowDefinition(baseDefinition() as any);
    expect(result.valid).toBe(true);
  });

  it('rejects cycles', () => {
    const definition = baseDefinition();
    const result = validateWorkflowDefinition({
      ...definition,
      edges: [
        ...definition.edges,
        { id: EDGE_C_B, from: NODE_C, to: NODE_B, priority: 0 },
      ],
    } as any);
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
        {
          id: EDGE_A_B,
          from: NODE_A,
          to: '550e8400-e29b-41d4-a716-446655440199',
          priority: 0,
        },
      ],
    } as any);
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
    } as any);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some((issue) => issue.code === 'workflow_duplicate_node_id'),
      ).toBe(true);
    }
  });

  it('rejects condition nodes that are missing a configured branch edge', () => {
    const definition = baseDefinition();
    const result = validateWorkflowDefinition({
      ...definition,
      edges: definition.edges.filter((edge) => edge.id !== EDGE_B_D),
    } as any);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some(
          (issue) => issue.code === 'workflow_condition_branch_key_missing',
        ),
      ).toBe(true);
    }
  });

  it('rejects branched edges on non-condition nodes', () => {
    const definition = baseDefinition();
    const result = validateWorkflowDefinition({
      ...definition,
      edges: definition.edges.map((edge) =>
        edge.id === EDGE_A_B ? { ...edge, branchKey: 'unexpected' } : edge,
      ),
    } as any);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.issues.some(
          (issue) => issue.code === 'workflow_branch_key_requires_condition_node',
        ),
      ).toBe(true);
    }
  });
});
