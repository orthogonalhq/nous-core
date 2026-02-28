/**
 * Recovery interfaces for Nous-OSS.
 *
 * Phase 5.4 — Failure-Recovery Checkpoint, Retry, and Resume Governance.
 * Canonical source: failure-recovery-architecture-v1.md
 */
import type {
  RecoveryCheckpoint,
  RecoveryDomain,
  RecoveryFailureClass,
  RecoveryOperationClass,
  RecoverySegment,
  RecoveryTerminalState,
} from '../types/index.js';

/** Result of retry policy evaluation. */
export type RetryPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: 'retry_blocked' | 'escalate' };

/** Result of rollback policy evaluation. */
export type RollbackPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: 'compensation_required' | 'rollback_blocked' | 'review_required' };

/** Append-only recovery ledger. Enforces hash-chain integrity; seals segments before retention. */
export interface IRecoveryLedgerStore {
  append(event: RecoveryCriticalEvent): Promise<AppendResult>;
  seal(segmentId: string, witnessRef: string): Promise<SealResult>;
  getLastSegment(): Promise<RecoverySegment | null>;
  getCheckpoints(runId: string): Promise<RecoveryCheckpoint[]>;
  /** Get all checkpoints including prepare-only. Used by CheckpointManager for commit. */
  getAllCheckpoints(
    runId: string,
  ): Promise<{ checkpoint: RecoveryCheckpoint; is_committed: boolean }[]>;
  /** Store checkpoint record (prepare or commit). Used by CheckpointManager. */
  appendCheckpoint(
    checkpoint: RecoveryCheckpoint,
    isCommitted: boolean,
  ): Promise<void>;
}

/** Minimal recovery-critical event shape for append. */
export interface RecoveryCriticalEvent {
  event_type: string;
  run_id: string;
  project_id: string;
  domain_scope: RecoveryDomain;
  payload_hash: string;
  prev_event_hash: string | null;
  occurred_at: string;
}

/** Result of append. */
export interface AppendResult {
  success: boolean;
  segment_id?: string;
  sequence?: number;
  error?: string;
}

/** Result of seal. */
export interface SealResult {
  success: boolean;
  error?: string;
}

/** Two-phase checkpoint protocol. Only committed checkpoints are resumable. */
export interface ICheckpointManager {
  prepare(
    runId: string,
    projectId: string,
    snapshot: CheckpointSnapshot,
  ): Promise<PrepareResult>;
  commit(
    runId: string,
    checkpointId: string,
    witnessRef: string,
  ): Promise<CommitResult>;
  getLastCommitted(runId: string): Promise<RecoveryCheckpoint | null>;
  validateChain(runId: string): Promise<ChainValidationResult>;
}

/** Snapshot metadata for checkpoint. */
export interface CheckpointSnapshot {
  domain_scope: RecoveryDomain;
  state_vector_hash: string;
  policy_epoch: string;
  scheduler_cursor: string;
  tool_side_effect_journal_hwm: number;
  memory_write_journal_hwm: number;
  idempotency_key_set_hash: string;
}

/** Result of prepare. */
export interface PrepareResult {
  success: boolean;
  checkpoint_id?: string;
  error?: string;
}

/** Result of commit. */
export interface CommitResult {
  success: boolean;
  error?: string;
}

/** Result of chain validation. */
export interface ChainValidationResult {
  valid: boolean;
  error?: string;
}

/** Evaluates retry eligibility. Enforces budget; blocks side-effect retry without idempotency. */
export interface IRetryPolicyEvaluator {
  evaluate(
    context: RetryEvaluationContext,
  ): RetryPolicyResult | Promise<RetryPolicyResult>;
}

/** Context for retry evaluation. */
export interface RetryEvaluationContext {
  failure_class: RecoveryFailureClass;
  retry_attempt: number;
  retry_budget: number;
  has_idempotency_evidence: boolean;
  domain_scope: RecoveryDomain;
}

/** Evaluates rollback eligibility per operation class. */
export interface IRollbackPolicyEvaluator {
  evaluate(
    context: RollbackEvaluationContext,
  ): RollbackPolicyResult | Promise<RollbackPolicyResult>;
}

/** Context for rollback evaluation. */
export interface RollbackEvaluationContext {
  operation_class: RecoveryOperationClass;
  from_domain: RecoveryDomain;
  to_domain: RecoveryDomain;
  has_escalation_evidence: boolean;
  side_effect_status: 'idempotent' | 'compensatable' | 'unknown_external_effect';
}

/** Orchestrates recovery flow to terminal state. No orphan recovery. */
export interface IRecoveryOrchestrator {
  run(context: RecoveryOrchestratorContext): Promise<RecoveryTerminalState>;
}

/** Context for recovery orchestration. */
export interface RecoveryOrchestratorContext {
  run_id: string;
  project_id: string;
  failure_class: RecoveryFailureClass;
  ledger_store: IRecoveryLedgerStore;
  checkpoint_manager: ICheckpointManager;
  retry_evaluator: IRetryPolicyEvaluator;
  rollback_evaluator: IRollbackPolicyEvaluator;
}
