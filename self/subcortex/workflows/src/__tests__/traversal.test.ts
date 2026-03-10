import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  getActivatedOutboundEdgeIds,
  getInitialReadyNodeIds,
  getNextReadyNodeIds,
} from '../traversal.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440201';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440202';
const NODE_A = '550e8400-e29b-41d4-a716-446655440203';
const NODE_B = '550e8400-e29b-41d4-a716-446655440204';
const NODE_C = '550e8400-e29b-41d4-a716-446655440205';
const NODE_D = '550e8400-e29b-41d4-a716-446655440206';
const EDGE_A_B = '550e8400-e29b-41d4-a716-446655440207';
const EDGE_B_C = '550e8400-e29b-41d4-a716-446655440208';
const EDGE_A_D = '550e8400-e29b-41d4-a716-446655440209';
const EDGE_D_C = '550e8400-e29b-41d4-a716-446655440210';

describe('workflow traversal', () => {
  it('advances deterministically through a linear graph', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Linear Workflow',
      entryNodeIds: [NODE_A],
      nodes: [
        {
          id: NODE_A,
          name: 'Draft',
          type: 'model-call',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'model-call',
            modelRole: 'reasoner',
            promptRef: 'prompt://draft',
          },
        },
        {
          id: NODE_B,
          name: 'Review',
          type: 'quality-gate',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'quality-gate',
            evaluatorRef: 'evaluator://quality',
            passThresholdRef: 'threshold://default',
            failureAction: 'block',
          },
        },
        {
          id: NODE_C,
          name: 'Publish',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'transform',
            transformRef: 'transform://publish',
            inputMappingRef: 'mapping://draft',
          },
        },
      ],
      edges: [
        { id: EDGE_A_B, from: NODE_A, to: NODE_B, priority: 0 },
        { id: EDGE_B_C, from: NODE_B, to: NODE_C, priority: 0 },
      ],
    } as any);

    const activatedAfterA = getActivatedOutboundEdgeIds(graph, NODE_A as any);
    const activatedAfterB = getActivatedOutboundEdgeIds(graph, NODE_B as any);

    expect(getInitialReadyNodeIds(graph)).toEqual([NODE_A]);
    expect(
      getNextReadyNodeIds(graph, [NODE_A] as any, activatedAfterA as any, NODE_A as any),
    ).toEqual([
      NODE_B,
    ]);
    expect(
      getNextReadyNodeIds(
        graph,
        [NODE_A, NODE_B] as any,
        [...activatedAfterA, ...activatedAfterB] as any,
        NODE_B as any,
      ),
    ).toEqual([NODE_C]);
  });

  it('activates only the selected condition branch and still readies joins deterministically', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Branch Workflow',
      entryNodeIds: [NODE_A],
      nodes: [
        {
          id: NODE_A,
          name: 'Route',
          type: 'condition',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'condition',
            predicateRef: 'predicate://route',
            trueBranchKey: 'manual',
            falseBranchKey: 'auto',
          },
        },
        {
          id: NODE_B,
          name: 'Review',
          type: 'quality-gate',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'quality-gate',
            evaluatorRef: 'evaluator://manual',
            passThresholdRef: 'threshold://manual',
            failureAction: 'block',
          },
        },
        {
          id: NODE_D,
          name: 'Transform',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'transform',
            transformRef: 'transform://auto',
            inputMappingRef: 'mapping://auto',
          },
        },
        {
          id: NODE_C,
          name: 'Approve',
          type: 'human-decision',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'human-decision',
            decisionRef: 'decision://approve',
          },
        },
      ],
      edges: [
        { id: EDGE_A_B, from: NODE_A, to: NODE_B, branchKey: 'manual', priority: 1 },
        { id: EDGE_A_D, from: NODE_A, to: NODE_D, branchKey: 'auto', priority: 0 },
        { id: EDGE_B_C, from: NODE_B, to: NODE_C, priority: 0 },
        { id: EDGE_D_C, from: NODE_D, to: NODE_C, priority: 0 },
      ],
    } as any);

    const activatedAuto = getActivatedOutboundEdgeIds(graph, NODE_A as any, 'auto');
    const activatedAfterTransform = [
      ...activatedAuto,
      ...getActivatedOutboundEdgeIds(graph, NODE_D as any),
    ];

    expect(activatedAuto).toEqual([EDGE_A_D]);
    expect(
      getNextReadyNodeIds(graph, [NODE_A] as any, activatedAuto as any, NODE_A as any),
    ).toEqual([NODE_D]);
    expect(
      getNextReadyNodeIds(
        graph,
        [NODE_A, NODE_D] as any,
        activatedAfterTransform as any,
        NODE_D as any,
      ),
    ).toEqual([NODE_C]);
  });
});
