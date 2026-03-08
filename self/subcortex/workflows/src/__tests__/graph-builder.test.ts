import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440001';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440002';
const NODE_A = '550e8400-e29b-41d4-a716-446655440003';
const NODE_B = '550e8400-e29b-41d4-a716-446655440004';
const NODE_C = '550e8400-e29b-41d4-a716-446655440005';
const EDGE_A_B = '550e8400-e29b-41d4-a716-446655440006';
const EDGE_A_C = '550e8400-e29b-41d4-a716-446655440007';

const createDefinition = () =>
  ({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid' as const,
  version: '1.0.0',
  name: 'Branching Workflow',
  entryNodeIds: [NODE_A],
  nodes: [
    {
      id: NODE_A,
      name: 'Draft',
      type: 'model-call' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
    {
      id: NODE_B,
      name: 'Review',
      type: 'quality-gate' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
    {
      id: NODE_C,
      name: 'Publish',
      type: 'transform' as const,
      governance: 'must' as const,
      executionModel: 'synchronous' as const,
      config: {},
    },
  ],
  edges: [
    {
      id: EDGE_A_B,
      from: NODE_A,
      to: NODE_B,
      priority: 1,
    },
    {
      id: EDGE_A_C,
      from: NODE_A,
      to: NODE_C,
      priority: 0,
    },
  ],
}) as any;

describe('buildDerivedWorkflowGraph', () => {
  it('produces a stable digest across equivalent definition ordering', () => {
    const left = createDefinition();
    const right = {
      ...createDefinition(),
      nodes: [...createDefinition().nodes].reverse(),
      edges: [...createDefinition().edges].reverse(),
    };

    const leftGraph = buildDerivedWorkflowGraph(left);
    const rightGraph = buildDerivedWorkflowGraph(right);

    expect(leftGraph.graphDigest).toBe(rightGraph.graphDigest);
    expect(leftGraph.topologicalOrder).toEqual(rightGraph.topologicalOrder);
  });

  it('respects branch priority when computing topological order', () => {
    const graph = buildDerivedWorkflowGraph(createDefinition());
    expect(graph.topologicalOrder).toEqual([NODE_A, NODE_C, NODE_B]);
    expect(graph.nodes[NODE_A]?.outboundEdgeIds).toEqual([EDGE_A_C, EDGE_A_B]);
  });
});
