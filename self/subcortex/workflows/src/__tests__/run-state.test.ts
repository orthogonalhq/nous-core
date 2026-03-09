import { describe, it, expect } from 'vitest';
import { buildDerivedWorkflowGraph } from '../graph-builder.js';
import {
  completeWorkflowNodeInRunState,
  createInitialWorkflowRunState,
  recordWorkflowNodeExecution,
  resolveWorkflowNodeContinuation,
} from '../run-state.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440401';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655440402';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440403';
const NODE_A = '550e8400-e29b-41d4-a716-446655440404';
const NODE_B = '550e8400-e29b-41d4-a716-446655440405';
const NODE_C = '550e8400-e29b-41d4-a716-446655440406';
const EDGE_A_B = '550e8400-e29b-41d4-a716-446655440407';
const EDGE_A_C = '550e8400-e29b-41d4-a716-446655440408';
const CHECKPOINT_ID = '550e8400-e29b-41d4-a716-446655440409';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440410';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440411';
const CORRECTION_ARC_ID = '550e8400-e29b-41d4-a716-446655440412';
const NOW = '2026-03-08T00:00:00.000Z';

function createGovernanceDecision(actionCategory: 'trace-persist' | 'opctl-command') {
  const evidenceRef = {
    actionCategory,
    authorizationEventId: GOVERNANCE_EVENT_ID,
  };

  return {
    outcome: 'allow_with_flag' as const,
    reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
    governance: 'must' as const,
    actionCategory,
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

const linearGraph = buildDerivedWorkflowGraph({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Run State Workflow',
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
  ],
  edges: [{ id: EDGE_A_B, from: NODE_A, to: NODE_B, priority: 0 }],
} as any);

const branchedGraph = buildDerivedWorkflowGraph({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Branching Run State Workflow',
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
        trueBranchKey: 'publish',
        falseBranchKey: 'revise',
      },
    },
    {
      id: NODE_B,
      name: 'Publish',
      type: 'quality-gate',
      governance: 'must',
      executionModel: 'synchronous',
      config: {
        type: 'quality-gate',
        evaluatorRef: 'evaluator://publish',
        passThresholdRef: 'threshold://publish',
        failureAction: 'block',
      },
    },
    {
      id: NODE_C,
      name: 'Revise',
      type: 'transform',
      governance: 'must',
      executionModel: 'synchronous',
      config: {
        type: 'transform',
        transformRef: 'transform://revise',
        inputMappingRef: 'mapping://draft',
      },
    },
  ],
  edges: [
    { id: EDGE_A_B, from: NODE_A, to: NODE_B, branchKey: 'publish', priority: 0 },
    { id: EDGE_A_C, from: NODE_A, to: NODE_C, branchKey: 'revise', priority: 1 },
  ],
} as any);

const humanGraph = buildDerivedWorkflowGraph({
  id: WORKFLOW_ID,
  projectId: PROJECT_ID,
  mode: 'hybrid',
  version: '1.0.0',
  name: 'Human Workflow',
  entryNodeIds: [NODE_A],
  nodes: [
    {
      id: NODE_A,
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
  edges: [],
} as any);

describe('workflow run state helpers', () => {
  it('creates initial run state with entry nodes active and ready', () => {
    const runState = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph: linearGraph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: NOW,
    });

    expect(runState.status).toBe('ready');
    expect(runState.activeNodeIds).toEqual([NODE_A]);
    expect(runState.readyNodeIds).toEqual([NODE_A]);
    expect(runState.dispatchLineage).toHaveLength(1);
  });

  it('completes nodes and advances successors deterministically for legacy progression', () => {
    const initial = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph: linearGraph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: NOW,
    });

    const advanced = completeWorkflowNodeInRunState(initial, linearGraph, NODE_A as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:a'],
    });
    expect(advanced.completedNodeIds).toEqual([NODE_A]);
    expect(advanced.readyNodeIds).toEqual([NODE_B]);
    expect(advanced.dispatchLineage).toHaveLength(2);

    const completed = completeWorkflowNodeInRunState(advanced, linearGraph, NODE_B as any, {
      reasonCode: 'node_completed',
      evidenceRefs: ['workflow:complete:b'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.completedNodeIds).toEqual([NODE_A, NODE_B]);
  });

  it('records governed execution attempts and activates only the selected branch', () => {
    const initial = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph: branchedGraph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: NOW,
    });

    const executed = recordWorkflowNodeExecution({
      state: initial,
      graph: branchedGraph,
      nodeDefinitionId: NODE_A as any,
      result: {
        outcome: 'completed',
        governanceDecision: createGovernanceDecision('trace-persist'),
        sideEffectStatus: 'none',
        selectedBranchKey: 'publish',
        reasonCode: 'workflow_condition_completed',
        evidenceRefs: ['workflow:condition'],
      },
      transition: {
        reasonCode: 'node_executed',
        evidenceRefs: ['workflow:condition'],
      },
    });

    expect(executed.nodeStates[NODE_A]?.attempts).toHaveLength(1);
    expect(executed.nodeStates[NODE_A]?.attempts[0]?.selectedBranchKey).toBe(
      'publish',
    );
    expect(executed.completedNodeIds).toEqual([NODE_A]);
    expect(executed.readyNodeIds).toEqual([NODE_B]);
    expect(executed.activatedEdgeIds).toEqual([EDGE_A_B]);
  });

  it('resolves waiting node continuations into completion and checkpoint linkage', () => {
    const initial = createInitialWorkflowRunState({
      runId: RUN_ID as any,
      graph: humanGraph,
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      startedAt: NOW,
    });

    const waiting = recordWorkflowNodeExecution({
      state: initial,
      graph: humanGraph,
      nodeDefinitionId: NODE_A as any,
      result: {
        outcome: 'waiting',
        governanceDecision: createGovernanceDecision('opctl-command'),
        waitState: {
          kind: 'human_decision',
          reasonCode: 'workflow_waiting_for_human',
          evidenceRefs: ['workflow:wait'],
          requestedAt: NOW,
          resumeToken: 'resume-token',
        },
        sideEffectStatus: 'none',
        reasonCode: 'workflow_waiting_for_human',
        evidenceRefs: ['workflow:wait'],
      },
      transition: {
        reasonCode: 'node_waiting',
        evidenceRefs: ['workflow:wait'],
      },
    });

    const completed = resolveWorkflowNodeContinuation({
      state: waiting,
      graph: humanGraph,
      nodeDefinitionId: NODE_A as any,
      result: {
        outcome: 'completed',
        governanceDecision: createGovernanceDecision('opctl-command'),
        correctionArc: {
          id: CORRECTION_ARC_ID,
          runId: RUN_ID as any,
          nodeDefinitionId: NODE_A as any,
          type: 'resume',
          sourceAttempt: 1,
          checkpointId: CHECKPOINT_ID,
          reasonCode: 'workflow_human_decision_approved',
          evidenceRefs: ['workflow:resume'],
          occurredAt: NOW,
        },
        sideEffectStatus: 'none',
        checkpointId: CHECKPOINT_ID,
        outputRef: 'human://approved',
        reasonCode: 'workflow_human_decision_approved',
        evidenceRefs: ['workflow:resume'],
      },
      transition: {
        reasonCode: 'node_resumed',
        evidenceRefs: ['workflow:resume'],
      },
      checkpointState: 'idle',
      lastPreparedCheckpointId: CHECKPOINT_ID,
      lastCommittedCheckpointId: CHECKPOINT_ID,
    });

    expect(completed.status).toBe('completed');
    expect(completed.lastCommittedCheckpointId).toBe(CHECKPOINT_ID);
    expect(completed.nodeStates[NODE_A]?.status).toBe('completed');
    expect(completed.nodeStates[NODE_A]?.correctionArcs).toHaveLength(1);
    expect(completed.nodeStates[NODE_A]?.attempts[0]?.completedAt).toBe(NOW);
  });
});
