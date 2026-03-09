import { createHash } from 'node:crypto';
import type {
  ICheckpointManager,
  WorkflowCheckpointState,
  WorkflowExternalEffectStatus,
  WorkflowNodeDefinitionId,
  WorkflowRunState,
} from '@nous/shared';

export interface WorkflowCheckpointRuntimeDependencies {
  checkpointManager?: ICheckpointManager;
}

export interface CaptureWorkflowCheckpointInput {
  runState: WorkflowRunState;
  nodeDefinitionId: WorkflowNodeDefinitionId;
  sideEffectStatus: WorkflowExternalEffectStatus;
  commitMode?: 'immediate' | 'deferred';
}

export interface CaptureWorkflowCheckpointResult {
  checkpointState: WorkflowCheckpointState;
  checkpointId?: string;
  lastPreparedCheckpointId?: string;
  lastCommittedCheckpointId?: string;
}

export interface CommitWorkflowCheckpointInput {
  runState: WorkflowRunState;
  checkpointId?: string;
  witnessRef?: string;
}

export interface CommitWorkflowCheckpointResult {
  committed: boolean;
  checkpointState: WorkflowCheckpointState;
  checkpointId?: string;
  lastPreparedCheckpointId?: string;
  lastCommittedCheckpointId?: string;
}

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function captureWorkflowCheckpoint(
  deps: WorkflowCheckpointRuntimeDependencies,
  input: CaptureWorkflowCheckpointInput,
): Promise<CaptureWorkflowCheckpointResult> {
  if (!deps.checkpointManager || input.sideEffectStatus === 'none') {
    return { checkpointState: 'idle' };
  }

  const prepared = await deps.checkpointManager.prepare(
    input.runState.runId,
    input.runState.projectId,
    {
      domain_scope: 'project_run_domain',
      state_vector_hash: hashValue(
        `${input.runState.runId}:${input.nodeDefinitionId}:state`,
      ),
      policy_epoch: 'workflow-runtime-v1',
      scheduler_cursor: `workflow-node:${input.nodeDefinitionId}`,
      tool_side_effect_journal_hwm: 1,
      memory_write_journal_hwm: 0,
      idempotency_key_set_hash: hashValue(
        `${input.runState.runId}:${input.nodeDefinitionId}:idempotency`,
      ),
    },
  );

  if (!prepared.success || !prepared.checkpoint_id) {
    return {
      checkpointState: 'prepare_pending',
    };
  }

  if (input.commitMode === 'deferred') {
    return {
      checkpointState: 'commit_pending',
      checkpointId: prepared.checkpoint_id,
      lastPreparedCheckpointId: prepared.checkpoint_id,
    };
  }

  const committed = await deps.checkpointManager.commit(
    input.runState.runId,
    prepared.checkpoint_id,
    `workflow:${input.runState.runId}:${input.nodeDefinitionId}`,
  );

  if (!committed.success) {
    return {
      checkpointState: 'commit_pending',
      checkpointId: prepared.checkpoint_id,
      lastPreparedCheckpointId: prepared.checkpoint_id,
    };
  }

  return {
    checkpointState: 'idle',
    checkpointId: prepared.checkpoint_id,
    lastPreparedCheckpointId: prepared.checkpoint_id,
    lastCommittedCheckpointId: prepared.checkpoint_id,
  };
}

export async function commitWorkflowCheckpoint(
  deps: WorkflowCheckpointRuntimeDependencies,
  input: CommitWorkflowCheckpointInput,
): Promise<CommitWorkflowCheckpointResult> {
  const checkpointId =
    input.checkpointId ??
    input.runState.lastPreparedCheckpointId ??
    input.runState.lastCommittedCheckpointId;

  if (!deps.checkpointManager || !checkpointId) {
    return {
      committed: false,
      checkpointState: input.runState.checkpointState,
      checkpointId,
      lastPreparedCheckpointId: input.runState.lastPreparedCheckpointId,
      lastCommittedCheckpointId: input.runState.lastCommittedCheckpointId,
    };
  }

  const committed = await deps.checkpointManager.commit(
    input.runState.runId,
    checkpointId,
    input.witnessRef ?? `workflow:${input.runState.runId}:resume`,
  );

  if (!committed.success) {
    return {
      committed: false,
      checkpointState: 'commit_pending',
      checkpointId,
      lastPreparedCheckpointId:
        input.runState.lastPreparedCheckpointId ?? checkpointId,
      lastCommittedCheckpointId: input.runState.lastCommittedCheckpointId,
    };
  }

  return {
    committed: true,
    checkpointState: 'idle',
    checkpointId,
    lastPreparedCheckpointId:
      input.runState.lastPreparedCheckpointId ?? checkpointId,
    lastCommittedCheckpointId: checkpointId,
  };
}
