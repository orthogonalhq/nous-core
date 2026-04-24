/**
 * Compile-time guard for the WR-162 SP 2 `RecoveryOrchestratorContext`
 * extension (four additional optional fields). Ensures:
 *   1. Pre-existing 7-field construction sites still compile (contract-only addition).
 *   2. All four new optional fields are accepted and round-trip unchanged.
 *
 * The real signal here is `tsc` accepting the shape; the runtime `expect` calls
 * are smoke assertions only, per SDS § Observability + § Failure Modes row 6.
 */
import { describe, expect, it } from 'vitest';
import type {
  ICheckpointManager,
  IRecoveryLedgerStore,
  IRetryPolicyEvaluator,
  IRollbackPolicyEvaluator,
  RecoveryOrchestratorContext,
} from '../recovery.js';
import type { IWitnessService } from '../subcortex.js';

// --- Tiny throw-stub interface implementations. The bodies are never invoked;
// they only exist so TypeScript accepts the literal construction below.
const ledgerStoreStub = {} as IRecoveryLedgerStore;
const checkpointManagerStub = {} as ICheckpointManager;
const retryEvaluatorStub = {} as IRetryPolicyEvaluator;
const rollbackEvaluatorStub = {} as IRollbackPolicyEvaluator;
const witnessStub = {} as IWitnessService;

describe('RecoveryOrchestratorContext — WR-162 SP 2 extension', () => {
  it('accepts a literal with only the 7 pre-existing fields (contract-only optional)', () => {
    const ctx: RecoveryOrchestratorContext = {
      run_id: 'r1',
      project_id: 'p1',
      failure_class: 'retryable_transient',
      ledger_store: ledgerStoreStub,
      checkpoint_manager: checkpointManagerStub,
      retry_evaluator: retryEvaluatorStub,
      rollback_evaluator: rollbackEvaluatorStub,
    };
    // Smoke assertion; real signal is compile-time acceptance.
    expect(ctx.run_id).toBe('r1');
  });

  it('accepts a literal with all 7 existing + all 4 new optional fields', () => {
    const ctx: RecoveryOrchestratorContext = {
      run_id: 'r1',
      project_id: 'p1',
      failure_class: 'retryable_transient',
      ledger_store: ledgerStoreStub,
      checkpoint_manager: checkpointManagerStub,
      retry_evaluator: retryEvaluatorStub,
      rollback_evaluator: rollbackEvaluatorStub,
      retry_budget: 3,
      operation_class: 'idempotent',
      side_effect_status: 'unapplied',
      witness: witnessStub,
    };
    expect(ctx.retry_budget).toBe(3);
    expect(ctx.operation_class).toBe('idempotent');
    expect(ctx.side_effect_status).toBe('unapplied');
    expect(ctx.witness).toBe(witnessStub);
  });
});
