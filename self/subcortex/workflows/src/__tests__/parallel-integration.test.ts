import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  createInitialWorkflowRunState,
  recordWorkflowNodeExecution,
  resolveWorkflowNodeContinuation,
} from '../run-state.js';
import { createWorkflowNodeHandlerRegistry } from '../handlers/index.js';
import { resolveWorkflowContinuation } from '../continuations.js';
import type { WorkflowNodeExecutionContext } from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440801';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440802';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440803';
const SPLIT_NODE = '550e8400-e29b-41d4-a716-446655440804';
const BRANCH_A = '550e8400-e29b-41d4-a716-446655440805';
const BRANCH_B = '550e8400-e29b-41d4-a716-446655440806';
const BRANCH_C = '550e8400-e29b-41d4-a716-446655440807';
const JOIN_NODE = '550e8400-e29b-41d4-a716-446655440808';
const FINAL_NODE = '550e8400-e29b-41d4-a716-446655440809';
const EDGE_SPLIT_A = '550e8400-e29b-41d4-a716-446655440810';
const EDGE_SPLIT_B = '550e8400-e29b-41d4-a716-446655440811';
const EDGE_SPLIT_C = '550e8400-e29b-41d4-a716-446655440812';
const EDGE_A_JOIN = '550e8400-e29b-41d4-a716-446655440813';
const EDGE_B_JOIN = '550e8400-e29b-41d4-a716-446655440814';
const EDGE_C_JOIN = '550e8400-e29b-41d4-a716-446655440815';
const EDGE_JOIN_FINAL = '550e8400-e29b-41d4-a716-446655440816';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440817';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440818';
const NOW = '2026-03-31T00:00:00.000Z';

const CONDITION_NODE = '550e8400-e29b-41d4-a716-446655440819';
const COND_TRUE = '550e8400-e29b-41d4-a716-446655440820';
const COND_FALSE = '550e8400-e29b-41d4-a716-446655440821';
const COND_MERGE = '550e8400-e29b-41d4-a716-446655440822';
const EDGE_COND_TRUE = '550e8400-e29b-41d4-a716-446655440823';
const EDGE_COND_FALSE = '550e8400-e29b-41d4-a716-446655440824';
const EDGE_TRUE_MERGE = '550e8400-e29b-41d4-a716-446655440825';
const EDGE_FALSE_MERGE = '550e8400-e29b-41d4-a716-446655440826';

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

function buildFullParallelGraph(
  splitMode: 'all' | 'race' = 'all',
  joinMode: 'all' | 'any' | 'n-of-m' = 'all',
  requiredCount?: number,
  timeoutMs?: number,
) {
  return buildDerivedWorkflowGraph({
    id: WORKFLOW_ID,
    projectId: PROJECT_ID,
    mode: 'hybrid',
    version: '1.0.0',
    name: 'Parallel Integration',
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
        config: {
          type: 'parallel-join',
          joinMode,
          ...(requiredCount != null ? { requiredCount } : {}),
          ...(timeoutMs != null ? { timeoutMs } : {}),
        },
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

function splitCompletedResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    selectedBranchKey: undefined,
    reasonCode: 'workflow_parallel_split_activated',
    evidenceRefs: ['split_mode=all'],
  };
}

function branchCompletedResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    reasonCode: 'test_branch_completed',
    evidenceRefs: ['test_evidence'],
  };
}

function joinCompletedResult() {
  return {
    outcome: 'completed' as const,
    governanceDecision: createGovernanceDecision(),
    sideEffectStatus: 'none' as const,
    reasonCode: 'workflow_parallel_join_completed',
    evidenceRefs: ['test_evidence'],
  };
}

function joinWaitingResult() {
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

function createAdmission() {
  return { allowed: true, reasonCode: 'test', evidenceRefs: [] } as any;
}

describe('parallel integration — Split(all) + Join(all)', () => {
  it('completes full split -> parallel -> join -> final round trip', () => {
    const graph = buildFullParallelGraph('all', 'all');
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    // Step 1: Execute split
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: splitCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(BRANCH_A);
    expect(state.readyNodeIds).toContain(BRANCH_B);
    expect(state.readyNodeIds).toContain(BRANCH_C);

    // Step 2: Execute branch A -> join becomes ready
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_A as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Step 3: Execute join -> waiting (not all upstream done)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinWaitingResult(), transition,
    });
    expect(state.waitingNodeIds).toContain(JOIN_NODE);

    // Step 4: Execute branch B -> join re-activated
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_B as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Step 5: Execute join again -> still waiting (B done, C not yet)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinWaitingResult(), transition,
    });
    expect(state.waitingNodeIds).toContain(JOIN_NODE);

    // Step 6: Execute branch C -> join re-activated
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_C as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Step 7: Execute join -> completed (all upstream done)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinCompletedResult(), transition,
    });
    expect(state.completedNodeIds).toContain(JOIN_NODE);
    expect(state.readyNodeIds).toContain(FINAL_NODE);

    // Step 8: Execute final
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: FINAL_NODE as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.completedNodeIds).toContain(FINAL_NODE);
    expect(state.status).toBe('completed');
  });
});

describe('parallel integration — Split(all) + Join(any)', () => {
  it('join completes on first branch completion', () => {
    const graph = buildFullParallelGraph('all', 'any');
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: splitCompletedResult(), transition,
    });

    // Execute first branch -> join ready
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_A as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Join can complete immediately (any mode, 1 upstream done)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinCompletedResult(), transition,
    });
    expect(state.completedNodeIds).toContain(JOIN_NODE);
    expect(state.readyNodeIds).toContain(FINAL_NODE);
    // Other branches still active/ready
    expect(state.readyNodeIds).toContain(BRANCH_B);
    expect(state.readyNodeIds).toContain(BRANCH_C);
  });
});

describe('parallel integration — Split(all) + Join(n-of-m, N=2)', () => {
  it('join completes after exactly N upstream branches complete', () => {
    const graph = buildFullParallelGraph('all', 'n-of-m', 2);
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: splitCompletedResult(), transition,
    });

    // Branch A completes -> join ready but waiting
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_A as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Join executes -> waiting (only 1 of 2 required)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinWaitingResult(), transition,
    });
    expect(state.waitingNodeIds).toContain(JOIN_NODE);

    // Branch B completes -> join re-activated
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_B as any,
      result: branchCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Join executes -> completed (2 of 2 required met)
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinCompletedResult(), transition,
    });
    expect(state.completedNodeIds).toContain(JOIN_NODE);
  });
});

describe('parallel integration — Split(race) + Join(all)', () => {
  it('race winner completes, losers skipped, join sees all resolved', () => {
    const graph = buildFullParallelGraph('race', 'all');
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: splitCompletedResult(), transition,
    });
    expect(state.readyNodeIds).toContain(BRANCH_A);
    expect(state.readyNodeIds).toContain(BRANCH_B);
    expect(state.readyNodeIds).toContain(BRANCH_C);

    // Branch A wins the race
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_A as any,
      result: branchCompletedResult(), transition,
    });

    // B and C should be cancelled/skipped
    expect(state.nodeStates[BRANCH_B]?.status).toBe('skipped');
    expect(state.nodeStates[BRANCH_C]?.status).toBe('skipped');

    // Join should be ready (branch A completed, and it's the only completed upstream,
    // but since it's parallel-join, it becomes ready when any upstream completes)
    expect(state.readyNodeIds).toContain(JOIN_NODE);

    // Join executes — in a real scenario, the join handler would see 1 completed + 2 skipped
    // For 'all' mode join, completed + skipped = resolved, so it should complete
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinCompletedResult(), transition,
    });
    expect(state.completedNodeIds).toContain(JOIN_NODE);
    expect(state.readyNodeIds).toContain(FINAL_NODE);
  });
});

describe('parallel integration — join timeout', () => {
  it('timeout continuation completes join with timeout path', () => {
    const graph = buildFullParallelGraph('all', 'all', undefined, 5000);
    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: SPLIT_NODE as any,
      result: splitCompletedResult(), transition,
    });

    // Only branch A completes
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: BRANCH_A as any,
      result: branchCompletedResult(), transition,
    });

    // Join enters waiting
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: JOIN_NODE as any,
      result: joinWaitingResult(), transition,
    });
    expect(state.waitingNodeIds).toContain(JOIN_NODE);

    // Simulate timeout via continueNode (resolveWorkflowContinuation)
    const joinState = state.nodeStates[JOIN_NODE]!;
    const activeAttempt = joinState.attempts.find(
      (a: any) => a.attempt === joinState.activeAttempt,
    )!;

    const timeoutResult = resolveWorkflowContinuation({
      runState: state,
      nodeDefinition: graph.nodes[JOIN_NODE]!.definition,
      nodeState: joinState,
      activeAttempt,
      request: {
        executionId: RUN_ID,
        nodeDefinitionId: JOIN_NODE,
        action: 'complete',
        controlState: 'running',
        transition,
        payload: {
          detail: { timedOut: true },
        },
      } as any,
    });

    expect(timeoutResult.outcome).toBe('completed');
    expect(timeoutResult.reasonCode).toBe('workflow_parallel_join_timeout');
    expect(timeoutResult.selectedBranchKey).toBe('timeout');

    // Apply the timeout result
    state = resolveWorkflowNodeContinuation({
      state,
      graph,
      nodeDefinitionId: JOIN_NODE as any,
      result: timeoutResult,
      transition,
    });

    expect(state.completedNodeIds).toContain(JOIN_NODE);
    expect(state.nodeStates[JOIN_NODE]?.selectedBranchKey).toBe('timeout');
  });
});

describe('parallel integration — regression: condition handler unchanged', () => {
  it('condition-based workflow produces same results through modified traversal', () => {
    const graph = buildDerivedWorkflowGraph({
      id: WORKFLOW_ID,
      projectId: PROJECT_ID,
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Condition Regression',
      entryNodeIds: [CONDITION_NODE],
      nodes: [
        {
          id: CONDITION_NODE,
          name: 'Route',
          type: 'condition',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'condition',
            predicateRef: 'predicate://route',
            trueBranchKey: 'yes',
            falseBranchKey: 'no',
          },
        },
        {
          id: COND_TRUE,
          name: 'True Path',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'transform', transformRef: 'transform://yes', inputMappingRef: 'mapping://yes' },
        },
        {
          id: COND_FALSE,
          name: 'False Path',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'transform', transformRef: 'transform://no', inputMappingRef: 'mapping://no' },
        },
        {
          id: COND_MERGE,
          name: 'Merge',
          type: 'transform',
          governance: 'must',
          executionModel: 'synchronous',
          config: { type: 'transform', transformRef: 'transform://merge', inputMappingRef: 'mapping://merge' },
        },
      ],
      edges: [
        { id: EDGE_COND_TRUE, from: CONDITION_NODE, to: COND_TRUE, branchKey: 'yes', priority: 0 },
        { id: EDGE_COND_FALSE, from: CONDITION_NODE, to: COND_FALSE, branchKey: 'no', priority: 1 },
        { id: EDGE_TRUE_MERGE, from: COND_TRUE, to: COND_MERGE, priority: 0 },
        { id: EDGE_FALSE_MERGE, from: COND_FALSE, to: COND_MERGE, priority: 0 },
      ],
    } as any);

    let state = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph,
      admission: createAdmission(),
      transition,
    });

    // Condition evaluates to 'yes'
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: CONDITION_NODE as any,
      result: {
        outcome: 'completed',
        governanceDecision: createGovernanceDecision(),
        sideEffectStatus: 'none',
        selectedBranchKey: 'yes',
        reasonCode: 'workflow_condition_evaluated',
        evidenceRefs: ['selected_branch_key=yes'],
      },
      transition,
    });

    // Only true path should be ready (not false path)
    expect(state.readyNodeIds).toContain(COND_TRUE);
    expect(state.readyNodeIds).not.toContain(COND_FALSE);

    // Execute true path
    state = recordWorkflowNodeExecution({
      state, graph, nodeDefinitionId: COND_TRUE as any,
      result: branchCompletedResult(), transition,
    });

    // Merge should be ready (single inbound from true path, completed)
    expect(state.readyNodeIds).toContain(COND_MERGE);
  });
});

describe('parallel integration — handler registry', () => {
  it('includes parallel-split and parallel-join handlers', () => {
    const registry = createWorkflowNodeHandlerRegistry();
    expect(registry.has('parallel-split')).toBe(true);
    expect(registry.has('parallel-join')).toBe(true);
    expect(registry.get('parallel-split')?.nodeType).toBe('parallel-split');
    expect(registry.get('parallel-join')?.nodeType).toBe('parallel-join');
  });
});
