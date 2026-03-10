import { randomUUID } from 'node:crypto';
import type {
  WorkflowContinueNodeRequest,
  WorkflowCorrectionArc,
  WorkflowNodeAttempt,
  WorkflowNodeDefinition,
  WorkflowNodeExecutionResult,
  WorkflowNodeRunState,
  WorkflowRunState,
} from '@nous/shared';

export interface ResolveWorkflowContinuationInput {
  runState: WorkflowRunState;
  nodeDefinition: WorkflowNodeDefinition;
  nodeState: WorkflowNodeRunState;
  activeAttempt: WorkflowNodeAttempt;
  request: WorkflowContinueNodeRequest;
}

function buildCorrectionArc(
  runState: WorkflowRunState,
  nodeDefinition: WorkflowNodeDefinition,
  activeAttempt: WorkflowNodeAttempt,
  type: WorkflowCorrectionArc['type'],
  reasonCode: string,
  evidenceRefs: string[],
  checkpointId?: string,
): WorkflowCorrectionArc {
  return {
    id: randomUUID(),
    runId: runState.runId,
    nodeDefinitionId: nodeDefinition.id,
    type,
    sourceAttempt: activeAttempt.attempt,
    checkpointId,
    reasonCode,
    evidenceRefs,
    occurredAt: new Date().toISOString(),
  };
}

export function resolveWorkflowContinuation(
  input: ResolveWorkflowContinuationInput,
): WorkflowNodeExecutionResult {
  const { request, activeAttempt, nodeState, nodeDefinition, runState } = input;
  const activeWaitState = nodeState.activeWaitState;

  if (!activeWaitState) {
    throw new Error(`Workflow node ${nodeDefinition.id} is not waiting`);
  }

  const evidenceRefs = [
    ...request.transition.evidenceRefs,
    `workflow_node_id=${nodeDefinition.id}`,
    `workflow_attempt=${activeAttempt.attempt}`,
  ];

  if (
    request.continuationToken &&
    activeWaitState.resumeToken &&
    request.continuationToken !== activeWaitState.resumeToken
  ) {
    return {
      outcome: 'blocked',
      governanceDecision: activeAttempt.governanceDecision,
      correctionArc: buildCorrectionArc(
        runState,
        nodeDefinition,
        activeAttempt,
        'resume',
        'workflow_continuation_token_mismatch',
        evidenceRefs,
        activeAttempt.checkpointId,
      ),
      sideEffectStatus: activeAttempt.sideEffectStatus,
      reasonCode: 'workflow_continuation_token_mismatch',
      evidenceRefs,
    };
  }

  if (request.controlState === 'hard_stopped') {
    return {
      outcome: 'blocked',
      governanceDecision: activeAttempt.governanceDecision,
      correctionArc: buildCorrectionArc(
        runState,
        nodeDefinition,
        activeAttempt,
        'resume',
        'workflow_resume_denied_hard_stopped',
        evidenceRefs,
        activeAttempt.checkpointId,
      ),
      sideEffectStatus: activeAttempt.sideEffectStatus,
      reasonCode: 'workflow_resume_denied_hard_stopped',
      evidenceRefs,
    };
  }

  if (
    request.controlState === 'paused_review' ||
    request.controlState === 'resuming'
  ) {
    return {
      outcome: 'waiting',
      governanceDecision: activeAttempt.governanceDecision,
      waitState: {
        ...activeWaitState,
        reasonCode:
          request.controlState === 'paused_review'
            ? 'workflow_wait_paused_review'
            : 'workflow_wait_resuming',
        evidenceRefs,
      },
      sideEffectStatus: activeAttempt.sideEffectStatus,
      checkpointId: activeAttempt.checkpointId,
      outputRef: activeAttempt.outputRef,
      selectedBranchKey: activeAttempt.selectedBranchKey,
      reasonCode:
        request.controlState === 'paused_review'
          ? 'workflow_wait_paused_review'
          : 'workflow_wait_resuming',
      evidenceRefs,
    };
  }

  switch (activeWaitState.kind) {
    case 'human_decision': {
      if (request.payload?.humanDecision === 'rejected' || request.action === 'reject') {
        return {
          outcome: 'blocked',
          governanceDecision: activeAttempt.governanceDecision,
          correctionArc: buildCorrectionArc(
            runState,
            nodeDefinition,
            activeAttempt,
            'rollback',
            'workflow_human_decision_rejected',
            evidenceRefs,
            activeAttempt.checkpointId,
          ),
          sideEffectStatus: activeAttempt.sideEffectStatus,
          checkpointId: activeAttempt.checkpointId,
          reasonCode: 'workflow_human_decision_rejected',
          evidenceRefs,
        };
      }

      return {
        outcome: 'completed',
        governanceDecision: activeAttempt.governanceDecision,
        correctionArc: buildCorrectionArc(
          runState,
          nodeDefinition,
          activeAttempt,
          'resume',
          'workflow_human_decision_approved',
          evidenceRefs,
          activeAttempt.checkpointId,
        ),
        sideEffectStatus: activeAttempt.sideEffectStatus,
        checkpointId: activeAttempt.checkpointId,
        outputRef:
          request.payload?.outputRef ??
          activeAttempt.outputRef ??
          `human-decision:${nodeDefinition.id}:approved`,
        reasonCode: 'workflow_human_decision_approved',
        evidenceRefs,
      };
    }
    case 'async_batch': {
      if (
        activeAttempt.sideEffectStatus === 'unknown_external_effect' &&
        request.payload?.detail?.reviewApproved !== true
      ) {
        return {
          outcome: 'blocked',
          governanceDecision: activeAttempt.governanceDecision,
          correctionArc: buildCorrectionArc(
            runState,
            nodeDefinition,
            activeAttempt,
            'resume',
            'workflow_resume_review_required',
            evidenceRefs,
            activeAttempt.checkpointId,
          ),
          sideEffectStatus: activeAttempt.sideEffectStatus,
          checkpointId: activeAttempt.checkpointId,
          reasonCode: 'workflow_resume_review_required',
          evidenceRefs,
        };
      }

      return {
        outcome: 'completed',
        governanceDecision: activeAttempt.governanceDecision,
        correctionArc: buildCorrectionArc(
          runState,
          nodeDefinition,
          activeAttempt,
          'resume',
          'workflow_async_batch_completed',
          evidenceRefs,
          activeAttempt.checkpointId,
        ),
        sideEffectStatus:
          request.payload?.sideEffectStatus ?? activeAttempt.sideEffectStatus,
        checkpointId: activeAttempt.checkpointId,
        outputRef:
          request.payload?.outputRef ??
          activeAttempt.outputRef ??
          `async:${nodeDefinition.id}:completed`,
        selectedBranchKey:
          request.payload?.selectedBranchKey ?? activeAttempt.selectedBranchKey,
        reasonCode: 'workflow_async_batch_completed',
        evidenceRefs,
      };
    }
    case 'checkpoint_commit': {
      if (request.action !== 'complete' && request.action !== 'resume') {
        return {
          outcome: 'waiting',
          governanceDecision: activeAttempt.governanceDecision,
          waitState: activeWaitState,
          sideEffectStatus: activeAttempt.sideEffectStatus,
          checkpointId: activeAttempt.checkpointId,
          outputRef: activeAttempt.outputRef,
          selectedBranchKey: activeAttempt.selectedBranchKey,
          reasonCode: 'workflow_checkpoint_commit_pending',
          evidenceRefs,
        };
      }

      return {
        outcome: 'completed',
        governanceDecision: activeAttempt.governanceDecision,
        correctionArc: buildCorrectionArc(
          runState,
          nodeDefinition,
          activeAttempt,
          'resume',
          'workflow_checkpoint_commit_completed',
          evidenceRefs,
          activeAttempt.checkpointId,
        ),
        sideEffectStatus: activeAttempt.sideEffectStatus,
        checkpointId: request.checkpointId ?? activeAttempt.checkpointId,
        outputRef:
          request.payload?.outputRef ?? activeAttempt.outputRef,
        selectedBranchKey: activeAttempt.selectedBranchKey,
        reasonCode: 'workflow_checkpoint_commit_completed',
        evidenceRefs,
      };
    }
    case 'retry_backoff':
    default:
      return {
        outcome: 'blocked',
        governanceDecision: activeAttempt.governanceDecision,
        correctionArc: buildCorrectionArc(
          runState,
          nodeDefinition,
          activeAttempt,
          request.action === 'reprompt' ? 'reprompt' : 'retry',
          'workflow_retry_backoff_resolution_required',
          evidenceRefs,
          activeAttempt.checkpointId,
        ),
        sideEffectStatus: activeAttempt.sideEffectStatus,
        checkpointId: activeAttempt.checkpointId,
        reasonCode: 'workflow_retry_backoff_resolution_required',
        evidenceRefs,
      };
  }
}
