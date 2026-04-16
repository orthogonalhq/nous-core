import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  getActivatedOutboundEdgeIds,
  getNextReadyNodeIds,
} from '../traversal.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440301';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440302';
const SPLIT_NODE = '550e8400-e29b-41d4-a716-446655440303';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440304';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440305';
const BRANCH_C = '550e8400-e29b-41d4-a716-446655440306';
const JOIN_NODE = '550e8400-e29b-41d4-a716-446655440307';
const FINAL_NODE = '550e8400-e29b-41d4-a716-446655440308';
const EDGE_SPLIT_A = '550e8400-e29b-41d4-a716-446655440309';
const EDGE_SPLIT_B = '550e8400-e29b-41d4-a716-446655440310';
const EDGE_SPLIT_C = '550e8400-e29b-41d4-a716-446655440311';
const EDGE_A_JOIN = '550e8400-e29b-41d4-a716-446655440312';
const EDGE_B_JOIN = '550e8400-e29b-41d4-a716-446655440313';
const EDGE_C_JOIN = '550e8400-e29b-41d4-a716-446655440314';
const EDGE_JOIN_FINAL = '550e8400-e29b-41d4-a716-446655440315';

function buildParallelGraph() {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Parallel Workflow',
    entryNodeIds: [SPLIT_NODE],
    nodes: [
      {
        id: SPLIT_NODE,
        name: 'Split',
        type: 'parallel-split',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'parallel-split', splitMode: 'all', branches: [] },
      },
      {
        id: BRANCH_A,
        name: 'Branch A',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://a', inputMappingRef: 'mapping://a' },
      },
      {
        id: BRANCH_B,
        name: 'Branch B',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' },
      },
      {
        id: BRANCH_C,
        name: 'Branch C',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://c', inputMappingRef: 'mapping://c' },
      },
      {
        id: JOIN_NODE,
        name: 'Join',
        type: 'parallel-join',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'parallel-join', joinMode: 'all' },
      },
      {
        id: FINAL_NODE,
        name: 'Final',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://final', inputMappingRef: 'mapping://final' },
      },
    ],
    edges: [
      { id: EDGE_SPLIT_A, from: SPLIT_NODE, to: BRANCH_A, branchKey: 'branch-a', priority: 0 },
      { id: EDGE_SPLIT_B, from: SPLIT_NODE, to: BRANCH_B, branchKey: 'branch-b', priority: 1 },
      { id: EDGE_SPLIT_C, from: SPLIT_NODE, to: BRANCH_C, branchKey: 'branch-c', priority: 2 },
      { id: EDGE_A_JOIN, from: BRANCH_A, to: JOIN_NODE, priority: 0 },
      { id: EDGE_B_JOIN, from: BRANCH_B, to: JOIN_NODE, priority: 0 },
      { id: EDGE_C_JOIN, from: BRANCH_C, to: JOIN_NODE, priority: 0 },
      { id: EDGE_JOIN_FINAL, from: JOIN_NODE, to: FINAL_NODE, priority: 0 },
    ],
  } as any);
}

describe('traversal — parallel-split multi-branch activation', () => {
  it('activates all outbound edges when nodeType is parallel-split and no selectedBranchKey', () => {
    const graph = buildParallelGraph();
    const edgeIds = getActivatedOutboundEdgeIds(
      graph,
      SPLIT_NODE as any,
      undefined,
      'parallel-split',
    );
    expect(edgeIds).toHaveLength(3);
    expect(edgeIds).toContain(EDGE_SPLIT_A);
    expect(edgeIds).toContain(EDGE_SPLIT_B);
    expect(edgeIds).toContain(EDGE_SPLIT_C);
  });

  it('preserves existing filtering when nodeType is not provided', () => {
    const graph = buildParallelGraph();
    // Without nodeType, edges with branchKey and no selectedBranchKey are filtered out
    const edgeIds = getActivatedOutboundEdgeIds(graph, SPLIT_NODE as any);
    expect(edgeIds).toEqual([]);
  });

  it('preserves branch key filtering for non-parallel-split nodes', () => {
    const graph = buildParallelGraph();
    const edgeIds = getActivatedOutboundEdgeIds(
      graph,
      SPLIT_NODE as any,
      'branch-a',
      'condition',
    );
    expect(edgeIds).toEqual([EDGE_SPLIT_A]);
  });

  it('uses selectedBranchKey filtering when nodeType is parallel-split AND selectedBranchKey is provided (race winner)', () => {
    const graph = buildParallelGraph();
    const edgeIds = getActivatedOutboundEdgeIds(
      graph,
      SPLIT_NODE as any,
      'branch-b',
      'parallel-split',
    );
    expect(edgeIds).toEqual([EDGE_SPLIT_B]);
  });

  it('returns empty array for non-existent fromNodeId', () => {
    const graph = buildParallelGraph();
    const edgeIds = getActivatedOutboundEdgeIds(
      graph,
      '550e8400-e29b-41d4-a716-446655449999' as any,
      undefined,
      'parallel-split',
    );
    expect(edgeIds).toEqual([]);
  });
});

describe('traversal — parallel-join readiness gate', () => {
  it('marks parallel-join node ready when ANY activated inbound source completes', () => {
    const graph = buildParallelGraph();
    // Activate all split->branch and branch->join edges
    const allEdges = [
      EDGE_SPLIT_A, EDGE_SPLIT_B, EDGE_SPLIT_C,
      EDGE_A_JOIN, EDGE_B_JOIN, EDGE_C_JOIN,
    ];
    // Only branch A completed
    const readyNodeIds = getNextReadyNodeIds(
      graph,
      [SPLIT_NODE, BRANCH_A] as any,
      allEdges as any,
      BRANCH_A as any,
    );
    expect(readyNodeIds).toContain(JOIN_NODE);
  });

  it('marks non-join nodes ready only when ALL inbound sources complete', () => {
    const graph = buildParallelGraph();
    // All edges activated, but only branch A and B completed (not C)
    const allEdges = [
      EDGE_SPLIT_A, EDGE_SPLIT_B, EDGE_SPLIT_C,
      EDGE_A_JOIN, EDGE_B_JOIN, EDGE_C_JOIN,
      EDGE_JOIN_FINAL,
    ];
    // Join completed, final should be ready since it has 1 inbound from join
    const readyAfterJoin = getNextReadyNodeIds(
      graph,
      [SPLIT_NODE, BRANCH_A, BRANCH_B, BRANCH_C, JOIN_NODE] as any,
      allEdges as any,
      JOIN_NODE as any,
    );
    expect(readyAfterJoin).toContain(FINAL_NODE);
  });

  it('does not mark parallel-join ready when no activated inbound source has completed', () => {
    const graph = buildParallelGraph();
    // Edges activated but only split completed (not any branch)
    const readyNodeIds = getNextReadyNodeIds(
      graph,
      [SPLIT_NODE] as any,
      [EDGE_SPLIT_A, EDGE_A_JOIN] as any,
      SPLIT_NODE as any,
    );
    // Branch A should be ready (its only inbound from split is complete)
    expect(readyNodeIds).toContain(BRANCH_A);
    // But join should NOT be ready (branch A hasn't completed yet)
    expect(readyNodeIds).not.toContain(JOIN_NODE);
  });
});
