import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  createInitialWorkflowRunState,
  recordWorkflowNodeExecution,
} from '../run-state.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440c01';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440c02';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440c03';
const LOOP_NODE = '550e8400-e29b-41d4-a716-446655440c04';
const BODY_NODE = '550e8400-e29b-41d4-a716-446655440c05';
const EXIT_NODE = '550e8400-e29b-41d4-a716-446655440c06';
const EDGE_LOOP_BODY = '550e8400-e29b-41d4-a716-446655440c07';
const EDGE_LOOP_EXIT = '550e8400-e29b-41d4-a716-446655440c08';
const EDGE_BODY_DUMMY = '550e8400-e29b-41d4-a716-446655440c09';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440c10';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440c11';
const NOW = '2026-03-31T00:00:00.000Z';

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

const transition = {
  reasonCode: 'test_transition',
  evidenceRefs: ['test_evidence'],
  occurredAt: NOW,
};

function createAdmission() {
  return { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any;
}

function buildLoopGraph() {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Loop Re-activation Test',
    entryNodeIds: [LOOP_NODE],
    nodes: [
      {
        id: LOOP_NODE,
        name: 'Loop',
        type: 'loop',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'loop', maxIterations: 5, exitConditionRef: 'check://done' },
      },
      {
        id: BODY_NODE,
        name: 'Body',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://body', inputMappingRef: 'mapping://body' },
      },
      {
        id: EXIT_NODE,
        name: 'Exit',
        type: 'transform',
        governance: 'must',
        executionModel: 'synchronous',
        config: { type: 'transform', transformRef: 'transform://exit', inputMappingRef: 'mapping://exit' },
      },
    ],
    edges: [
      { id: EDGE_LOOP_BODY, from: LOOP_NODE, to: BODY_NODE, branchKey: 'loop', priority: 0 },
      { id: EDGE_LOOP_EXIT, from: LOOP_NODE, to: EXIT_NODE, branchKey: 'exit', priority: 1 },
    ],
  } as any);
}

function loopContinueResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    selectedBranchKey: 'loop',
    reasonCode: 'workflow_loop_continue',
    evidenceRefs: ['test_evidence'],
  };
}

function loopExitResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    selectedBranchKey: 'exit',
    reasonCode: 'workflow_loop_exit_condition_met',
    evidenceRefs: ['test_evidence'],
  };
}

function bodyCompletedResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    reasonCode: 'body_completed',
    evidenceRefs: ['test_evidence'],
  };
}

function bodyFailedResult() {
  return {
    outcome: 'failed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    reasonCode: 'body_failed',
    evidenceRefs: ['test_evidence'],
  };
}

describe('run-state loop re-activation', () => {
  it('loop node is re-activated to ready when loop body completes and selectedBranchKey was loop', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    // Execute loop node with selectedBranchKey: 'loop'
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });
    // Body node should be ready
    expect(state.readyNodeIds).toContain(BODY_NODE);
    expect(state.completedNodeIds).toContain(LOOP_NODE);

    // Execute body node (completes)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });

    // Loop node should be re-activated
    expect(state.readyNodeIds).toContain(LOOP_NODE);
    expect(state.nodeStates[LOOP_NODE]?.status).toBe('ready');
  });

  it('loop node is removed from completedNodeIds during re-activation', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });
    expect(state.completedNodeIds).toContain(LOOP_NODE);

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });

    expect(state.completedNodeIds).not.toContain(LOOP_NODE);
  });

  it('loop node is NOT re-activated when last selectedBranchKey was exit', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    // Execute loop node with selectedBranchKey: 'exit'
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopExitResult(), transition,
    });
    // Exit node should be ready
    expect(state.readyNodeIds).toContain(EXIT_NODE);
    expect(state.completedNodeIds).toContain(LOOP_NODE);

    // Execute exit node
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: EXIT_NODE as any,
      result: bodyCompletedResult(), transition,
    });

    // Loop node should NOT be re-activated (exit was chosen)
    expect(state.readyNodeIds).not.toContain(LOOP_NODE);
    expect(state.completedNodeIds).toContain(LOOP_NODE);
  });

  it('loop node is NOT re-activated when loop body node fails', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });

    // Body fails — loop should not re-activate
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyFailedResult(), transition,
    });

    // Loop node stays completed, does not re-activate
    expect(state.readyNodeIds).not.toContain(LOOP_NODE);
  });

  it('new dispatch lineage is created for re-activated loop node', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    const lineageCountBefore = state.dispatchLineage.length;

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });

    // New lineage entries should have been created (for loop execution, body activation, body execution, and loop re-activation)
    expect(state.dispatchLineage.length).toBeGreaterThan(lineageCountBefore);

    // The loop node's lastDispatchLineageId should reference a re-activation lineage
    const loopNodeState = state.nodeStates[LOOP_NODE];
    const reactivationLineage = state.dispatchLineage.find(
      (l) => l.id === loopNodeState?.lastDispatchLineageId,
    );
    expect(reactivationLineage).toBeDefined();
    expect(reactivationLineage?.reasonCode).toBe('loop_reactivation');
  });

  it('loop re-activation does not duplicate ready entries', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });

    // Loop node should appear exactly once in readyNodeIds
    const loopOccurrences = state.readyNodeIds.filter((id) => id === LOOP_NODE);
    expect(loopOccurrences).toHaveLength(1);
  });

  it('multi-iteration loop works end-to-end', () => {
    const graph = buildLoopGraph();
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    // Iteration 1: loop -> body -> re-activate
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);

    // Iteration 2: loop -> body -> re-activate
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopContinueResult(), transition,
    });
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BODY_NODE as any,
      result: bodyCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(LOOP_NODE);

    // Iteration 3: loop exits
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: LOOP_NODE as any,
      result: loopExitResult(), transition,
    });
    expect(state.readyNodeIds).toContain(EXIT_NODE);
    expect(state.readyNodeIds).not.toContain(LOOP_NODE);
  });
});
