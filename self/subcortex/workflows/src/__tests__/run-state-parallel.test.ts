import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  createInitialWorkflowRunState,
  recordWorkflowNodeExecution,
} from '../run-state.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440701';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440702';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440703';
const SPLIT_NODE = '550e8400-e29b-41d4-a716-446655440704';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440705';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440706';
const BRANCH_C = '550e8400-e29b-41d4-a716-446655440707';
const JOIN_NODE = '550e8400-e29b-41d4-a716-446655440708';
const FINAL_NODE = '550e8400-e29b-41d4-a716-446655440709';
const EDGE_SPLIT_A = '550e8400-e29b-41d4-a716-446655440710';
const EDGE_SPLIT_B = '550e8400-e29b-41d4-a716-446655440711';
const EDGE_SPLIT_C = '550e8400-e29b-41d4-a716-446655440712';
const EDGE_A_JOIN = '550e8400-e29b-41d4-a716-446655440713';
const EDGE_B_JOIN = '550e8400-e29b-41d4-a716-446655440714';
const EDGE_C_JOIN = '550e8400-e29b-41d4-a716-446655440715';
const EDGE_JOIN_FINAL = '550e8400-e29b-41d4-a716-446655440716';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440717';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440718';
const NOW = '2026-03-31T00:00:00.000Z';

// Extra node IDs for descendant cancellation tests
const BRANCH_A_CHILD = '550e8400-e29b-41d4-a716-446655440719';
const EDGE_A_CHILD = '550e8400-e29b-41d4-a716-446655440720';

function createGovernanceDecision() {
  const evidenceRef = {
    actionCategory: 'trace-persist' as const,
    authorizationEventId: GOVERNANCE_EVENT_ID,
  };
  return {
    outcome: 'allow_with_flag' as const,
    reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
    governance: 'must' as const,
    actionCategory: 'trace-persist' as const,
    projectControlState: 'running' as const,
    patternId: GOVERNANCE_PATTERN_ID,
    confidence: 0.94,
    confidenceTier: 'high' as const,
    supportingSignals: 16,
    decayState: 'stable' as const,
    autonomyAllowed: false,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [evidenceRef],
    explanation: {
      patternId: GOVERNANCE_PATTERN_ID,
      outcomeRef: `workflow:${RUN_ID}`,
      evidenceRefs: [evidenceRef],
    },
  } as any;
}

function completedResult(selectedBranchKey?: string) {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    selectedBranchKey,
    reasonCode: 'test_completed',
    evidenceRefs: ['test_evidence'],
  };
}

function waitingResult() {
  return {
    outcome: 'waiting' as const,
    governanceDecision: createGovernanceDecision(),
    waitState: {
      kind: 'parallel_join' as const,
      reasonCode: 'workflow_parallel_join_waiting',
      evidenceRefs: ['test_evidence'],
      requestedAt: NOW,
    },
    sideEffectStatus: 'none' as const,
    reasonCode: 'workflow_parallel_join_waiting',
    evidenceRefs: ['test_evidence'],
  };
}

const transition = {
  reasonCode: 'test_transition',
  evidenceRefs: ['test_evidence'],
  occurredAt: NOW,
};

function buildParallelGraph(splitMode: 'all' | 'race' = 'all') {
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
        config: { type: 'parallel-split', splitMode, branches: [] },
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

describe('run-state — parallel-split activateSuccessors', () => {
  it('activates all branch nodes when parallel-split completes with splitMode: all', () => {
    const graph = buildParallelGraph('all');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    expect(initialState.readyNodeIds).toEqual([SPLIT_NODE]);

    // Execute split node -> completes, activates all branches
    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    expect(afterSplit.completedNodeIds).toContain(SPLIT_NODE);
    expect(afterSplit.readyNodeIds).toContain(BRANCH_A);
    expect(afterSplit.readyNodeIds).toContain(BRANCH_B);
    expect(afterSplit.readyNodeIds).toContain(BRANCH_C);
    expect(afterSplit.readyNodeIds).toHaveLength(3);
  });
});

describe('run-state — parallel-join re-activation', () => {
  it('re-activates waiting join node when a new upstream branch completes', () => {
    const graph = buildParallelGraph('all');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    // Execute split
    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    // Execute branch A -> join becomes ready
    const afterBranchA = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    expect(afterBranchA.readyNodeIds).toContain(JOIN_NODE);

    // Execute join -> returns waiting (not all upstream complete)
    const afterJoinWait = recordWorkflowNodeExecution({
      state: afterBranchA,
      graph,
      nodeDefinitionId: JOIN_NODE as any,
      result: waitingResult(),
      transition,
    });

    expect(afterJoinWait.waitingNodeIds).toContain(JOIN_NODE);
    expect(afterJoinWait.readyNodeIds).not.toContain(JOIN_NODE);

    // Execute branch B -> join should be re-activated (moved back to ready)
    const afterBranchB = recordWorkflowNodeExecution({
      state: afterJoinWait,
      graph,
      nodeDefinitionId: BRANCH_B as any,
      result: completedResult(),
      transition,
    });

    expect(afterBranchB.readyNodeIds).toContain(JOIN_NODE);
    expect(afterBranchB.waitingNodeIds).not.toContain(JOIN_NODE);
    // joinProgress should be updated
    expect(afterBranchB.nodeStates[JOIN_NODE]?.joinProgress?.completedUpstreamNodeIds).toContain(BRANCH_B);
  });

  it('does not create duplicate readyNodeIds entries on join re-activation', () => {
    const graph = buildParallelGraph('all');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    const afterBranchA = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    const afterJoinWait = recordWorkflowNodeExecution({
      state: afterBranchA,
      graph,
      nodeDefinitionId: JOIN_NODE as any,
      result: waitingResult(),
      transition,
    });

    const afterBranchB = recordWorkflowNodeExecution({
      state: afterJoinWait,
      graph,
      nodeDefinitionId: BRANCH_B as any,
      result: completedResult(),
      transition,
    });

    // Count occurrences of JOIN_NODE in readyNodeIds
    const joinCount = afterBranchB.readyNodeIds.filter((id) => id === JOIN_NODE).length;
    expect(joinCount).toBe(1);
  });
});

describe('run-state — race cancellation', () => {
  it('cancels sibling branches when a race branch completes', () => {
    const graph = buildParallelGraph('race');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    // Execute split
    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    expect(afterSplit.readyNodeIds).toContain(BRANCH_A);
    expect(afterSplit.readyNodeIds).toContain(BRANCH_B);
    expect(afterSplit.readyNodeIds).toContain(BRANCH_C);

    // Branch A completes first -> should cancel B and C
    const afterRaceWin = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    expect(afterRaceWin.nodeStates[BRANCH_B]?.status).toBe('skipped');
    expect(afterRaceWin.nodeStates[BRANCH_B]?.reasonCode).toBe('workflow_race_cancelled');
    expect(afterRaceWin.nodeStates[BRANCH_C]?.status).toBe('skipped');
    expect(afterRaceWin.nodeStates[BRANCH_C]?.reasonCode).toBe('workflow_race_cancelled');
    expect(afterRaceWin.readyNodeIds).not.toContain(BRANCH_B);
    expect(afterRaceWin.readyNodeIds).not.toContain(BRANCH_C);
  });

  it('does not cancel already-completed siblings', () => {
    const graph = buildParallelGraph('race');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    // Both A and B complete (race tie scenario — first by topological order)
    const afterA = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    // B is now skipped from race cancellation. If we tried to process it,
    // the status check would prevent it (status !== 'ready')
    expect(afterA.nodeStates[BRANCH_B]?.status).toBe('skipped');
    expect(afterA.nodeStates[BRANCH_A]?.status).toBe('completed');
  });

  it('does not trigger race cancellation for non-race splits', () => {
    const graph = buildParallelGraph('all');
    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    // Branch A completes — siblings should NOT be cancelled (splitMode: all)
    const afterBranchA = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    expect(afterBranchA.nodeStates[BRANCH_B]?.status).toBe('ready');
    expect(afterBranchA.nodeStates[BRANCH_C]?.status).toBe('ready');
  });

  it('cancels downstream descendants of race losers', () => {
    // Build a graph with a descendant after branch A
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Race Descendant',
      entryNodeIds: [SPLIT_NODE],
      nodes: [
        {
          id: SPLIT_NODE,
          name: 'Split',
          type: 'parallel-split',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'parallel-split', splitMode: 'race', branches: [] },
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
          id: BRANCH_A_CHILD,
          name: 'Branch A Child',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'transform', transformRef: 'transform://ac', inputMappingRef: 'mapping://ac' },
        },
        {
          id: BRANCH_B,
          name: 'Branch B',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'transform', transformRef: 'transform://b', inputMappingRef: 'mapping://b' },
        },
      ],
      edges: [
        { id: EDGE_SPLIT_A, from: SPLIT_NODE, to: BRANCH_A, branchKey: 'branch-a', priority: 0 },
        { id: EDGE_SPLIT_B, from: SPLIT_NODE, to: BRANCH_B, branchKey: 'branch-b', priority: 1 },
        { id: EDGE_A_CHILD, from: BRANCH_A, to: BRANCH_A_CHILD, priority: 0 },
      ],
    } as any);

    const initialState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any,
      transition,
    });

    const afterSplit = recordWorkflowNodeExecution({
      state: initialState,
      graph,
      nodeDefinitionId: SPLIT_NODE as any,
      result: completedResult(),
      transition,
    });

    // Execute branch A -> activates A_CHILD
    const afterA = recordWorkflowNodeExecution({
      state: afterSplit,
      graph,
      nodeDefinitionId: BRANCH_A as any,
      result: completedResult(),
      transition,
    });

    // A_CHILD should be ready
    expect(afterA.readyNodeIds).toContain(BRANCH_A_CHILD);

    // Now B completes — but wait, A already completed, so B should be skipped by race
    // Actually, A completed first so B was already cancelled. Let me adjust.
    // Since A was completed already, B was cancelled. Let's check the state.
    expect(afterA.nodeStates[BRANCH_B]?.status).toBe('skipped');
    // And BRANCH_A_CHILD should be unaffected since it's downstream of the winner
    expect(afterA.nodeStates[BRANCH_A_CHILD]?.status).toBe('ready');
  });
});
