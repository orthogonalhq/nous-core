import { describe, it, expect } from 'vitest';
import { resolveWorkflowContinuation } from '../continuations.js';
import type {
  WorkflowNodeAttempt,
  WorkflowNodeDefinition,
  WorkflowNodeRunState,
  WorkflowRunState,
  WorkflowContinueNodeRequest,
} from '@nous/shared';

const NODE_ID = '550e8400-e29b-41d4-a716-446655440d01';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440d02';
const GOVERNANCE_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440d03';
const GOVERNANCE_EVENT_ID = '550e8400-e29b-41d4-a716-446655440d04';
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

function createInput(overrides?: Partial<{
  controlState: string;
  action: string;
}>) {
  const governanceDecision = createGovernanceDecision();
  const activeAttempt: WorkflowNodeAttempt = {
    attempt: 1,
    status: 'waiting',
    dispatchLineageId: '550e8400-e29b-41d4-a716-446655440d05' as any,
    governanceDecision,
    sideEffectStatus: 'none',
    selectedBranchKey: 'loop',
    reasonCode: 'workflow_loop_backoff',
    evidenceRefs: ['test_evidence'],
    startedAt: NOW,
    updatedAt: NOW,
  };

  const nodeState: WorkflowNodeRunState = {
    id: '550e8400-e29b-41d4-a716-446655440d06' as any,
    nodeDefinitionId: NODE_ID as any,
    status: 'waiting',
    attempts: [activeAttempt],
    activeAttempt: 1,
    correctionArcs: [],
    reasonCode: 'workflow_loop_backoff',
    evidenceRefs: ['test_evidence'],
    activeWaitState: {
      kind: 'loop_backoff',
      reasonCode: 'workflow_loop_backoff',
      evidenceRefs: ['test_evidence'],
      requestedAt: NOW,
      externalRef: 'backoff_ms=200',
    },
    updatedAt: NOW,
  };

  const nodeDefinition: WorkflowNodeDefinition = {
    id: NODE_ID as any,
    name: 'Loop Node',
    type: 'loop',
    governance: 'must',
    executionModel: 'synchronous',
    config: { type: 'loop', maxIterations: 5, exitConditionRef: 'check://done' },
  } as any;

  const runState: WorkflowRunState = {
    runId: RUN_ID,
    nodeStates: { [NODE_ID]: nodeState },
  } as any;

  const request: WorkflowContinueNodeRequest = {
    controlState: (overrides?.controlState ?? 'running') as any,
    action: (overrides?.action ?? 'resume') as any,
    transition: {
      reasonCode: 'loop_backoff_resolved',
      evidenceRefs: ['backoff_timer_fired'],
    },
  } as any;

  return {
    runState,
    nodeDefinition,
    nodeState,
    activeAttempt,
    request,
  };
}

describe('loop_backoff continuation', () => {
  it('resolves to outcome: completed with selectedBranchKey: loop', () => {
    const input = createInput();
    const result = resolveWorkflowContinuation(input);

    expect(result.outcome).toBe('completed');
    expect(result.selectedBranchKey).toBe('loop');
    expect(result.reasonCode).toBe('workflow_loop_backoff_resolved');
  });

  it('preserves governance decision from active attempt', () => {
    const input = createInput();
    const result = resolveWorkflowContinuation(input);

    expect(result.governanceDecision).toBe(input.activeAttempt.governanceDecision);
  });

  it('returns sideEffectStatus: none', () => {
    const input = createInput();
    const result = resolveWorkflowContinuation(input);

    expect(result.sideEffectStatus).toBe('none');
  });

  it('includes evidence refs from request transition', () => {
    const input = createInput();
    const result = resolveWorkflowContinuation(input);

    expect(result.evidenceRefs).toContain('backoff_timer_fired');
    expect(result.evidenceRefs).toContain(`workflow_node_id=${NODE_ID}`);
  });
});
