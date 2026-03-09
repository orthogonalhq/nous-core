import { describe, it, expect } from 'vitest';
import { resolveWorkflowContinuation } from '../continuations.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440701';
const NODE_ID = '550e8400-e29b-41d4-a716-446655440702';
const CHECKPOINT_ID = '550e8400-e29b-41d4-a716-446655440703';
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440704';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440705';
const NOW = '2026-03-08T00:00:00.000Z';

const governanceDecision = {
  outcome: 'allow_with_flag' as const,
  reasonCode: 'CGR-ALLOW-WITH-FLAG' as const,
  governance: 'must' as const,
  actionCategory: 'trace-persist' as const,
  projectControlState: 'running' as const,
  patternId: PATTERN_ID,
  confidence: 0.94,
  confidenceTier: 'high' as const,
  supportingSignals: 16,
  decayState: 'stable' as const,
  autonomyAllowed: false,
  requiresConfirmation: false,
  highRiskOverrideApplied: false,
  evidenceRefs: [
    {
      actionCategory: 'trace-persist' as const,
      authorizationEventId: EVENT_ID,
    },
  ],
  explanation: {
    patternId: PATTERN_ID,
    outcomeRef: `workflow:${RUN_ID}`,
    evidenceRefs: [
      {
        actionCategory: 'trace-persist' as const,
        authorizationEventId: EVENT_ID,
      },
    ],
  },
};

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    runState: {
      runId: RUN_ID,
    },
    nodeDefinition: {
      id: NODE_ID,
      type: 'tool-execution',
    },
    nodeState: {
      activeWaitState: {
        kind: 'async_batch',
        reasonCode: 'workflow_node_waiting_async_batch',
        evidenceRefs: ['workflow:wait'],
        requestedAt: NOW,
        resumeToken: 'resume-token',
      },
    },
    activeAttempt: {
      attempt: 1,
      governanceDecision,
      sideEffectStatus: 'idempotent',
      checkpointId: CHECKPOINT_ID,
      outputRef: 'artifact://draft',
      selectedBranchKey: 'publish',
    },
    request: {
      executionId: RUN_ID,
      nodeDefinitionId: NODE_ID,
      controlState: 'running',
      action: 'complete',
      continuationToken: 'resume-token',
      payload: {},
      transition: {
        reasonCode: 'node_resumed',
        evidenceRefs: ['workflow:resume'],
      },
      checkpointId: CHECKPOINT_ID,
    },
    ...overrides,
  } as any;
}

describe('resolveWorkflowContinuation', () => {
  it('blocks stale continuation tokens', () => {
    const result = resolveWorkflowContinuation(
      createInput({
        request: {
          ...createInput().request,
          continuationToken: 'stale-token',
        },
      }),
    );

    expect(result.outcome).toBe('blocked');
    expect(result.reasonCode).toBe('workflow_continuation_token_mismatch');
    expect(result.correctionArc?.type).toBe('resume');
  });

  it('keeps paused_review continuations waiting', () => {
    const result = resolveWorkflowContinuation(
      createInput({
        request: {
          ...createInput().request,
          controlState: 'paused_review',
        },
      }),
    );

    expect(result.outcome).toBe('waiting');
    expect(result.reasonCode).toBe('workflow_wait_paused_review');
    expect(result.waitState?.kind).toBe('async_batch');
  });

  it('maps rejected human decisions to rollback blocking', () => {
    const result = resolveWorkflowContinuation(
      createInput({
        nodeDefinition: {
          id: NODE_ID,
          type: 'human-decision',
        },
        nodeState: {
          activeWaitState: {
            kind: 'human_decision',
            reasonCode: 'workflow_human_decision_required',
            evidenceRefs: ['workflow:wait'],
            requestedAt: NOW,
            resumeToken: 'resume-token',
          },
        },
        request: {
          ...createInput().request,
          action: 'reject',
          payload: {
            humanDecision: 'rejected',
          },
        },
      }),
    );

    expect(result.outcome).toBe('blocked');
    expect(result.reasonCode).toBe('workflow_human_decision_rejected');
    expect(result.correctionArc?.type).toBe('rollback');
  });

  it('blocks async resume when side effects remain review-gated', () => {
    const result = resolveWorkflowContinuation(
      createInput({
        activeAttempt: {
          ...createInput().activeAttempt,
          sideEffectStatus: 'unknown_external_effect',
        },
      }),
    );

    expect(result.outcome).toBe('blocked');
    expect(result.reasonCode).toBe('workflow_resume_review_required');
    expect(result.correctionArc?.type).toBe('resume');
  });

  it('completes checkpoint commit waits only on resume-like actions', () => {
    const result = resolveWorkflowContinuation(
      createInput({
        nodeState: {
          activeWaitState: {
            kind: 'checkpoint_commit',
            reasonCode: 'workflow_checkpoint_commit_pending',
            evidenceRefs: ['workflow:checkpoint'],
            requestedAt: NOW,
          },
        },
        request: {
          ...createInput().request,
          action: 'resume',
        },
      }),
    );

    expect(result.outcome).toBe('completed');
    expect(result.reasonCode).toBe('workflow_checkpoint_commit_completed');
    expect(result.correctionArc?.type).toBe('resume');
  });
});
