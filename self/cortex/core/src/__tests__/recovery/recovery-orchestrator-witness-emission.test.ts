/**
 * Recovery orchestrator witness-emission unit tests.
 *
 * WR-162 SP 8 — Recovery Orchestrator Expansion + Crash-Detect Wiring.
 * Validates:
 *   - 13 of 14 SP 2 RecoveryEventType literals emitted at correct decision
 *     points (`fr_recovery_witness_emitted` reserved per SUPV-SP8-019).
 *   - Single-emission-per-decision-point invariant (SUPV-SP8-005).
 *   - Three terminal-state convergence (SUPV-SP8-011).
 *   - Context-field consumption: `retry_budget` passthrough; `operation_class`
 *     + `side_effect_status` separate-concerns at the rollback-evaluator call
 *     boundary (UT-SP8-CTX-OPCLASS-DISJOINT + UT-SP8-CTX-SES-DISJOINT).
 *   - Unwired-witness silent short-circuit (SUPV-SP8-010 + SUPV-SP8-020).
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  ICheckpointManager,
  IRetryPolicyEvaluator,
  IRollbackPolicyEvaluator,
  IWitnessService,
  RecoveryCheckpoint,
  RecoveryOrchestratorContext,
  RetryEvaluationContext,
  RetryPolicyResult,
  RollbackEvaluationContext,
  RollbackPolicyResult,
  WitnessEvent,
  WitnessInvariantInput,
} from '@nous/shared';
import { RecoveryOrchestrator } from '../../recovery/recovery-orchestrator.js';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);

function makeCheckpoint(): RecoveryCheckpoint {
  return {
    checkpoint_id: 'cp-1',
    run_id: RUN_ID,
    project_id: PROJECT_ID,
    sequence: 1,
    domain_scope: 'step_domain',
    state_vector_hash: HASH,
    policy_epoch: 'e1',
    scheduler_cursor: 'c1',
    tool_side_effect_journal_hwm: 0,
    memory_write_journal_hwm: 0,
    idempotency_key_set_hash: HASH,
    prepared_at: '2026-01-01T00:00:00.000Z',
    committed_at: '2026-01-01T00:00:01.000Z',
    witness_event_id: 'w1',
  } as unknown as RecoveryCheckpoint;
}

function makeMockWitness(): {
  service: IWitnessService;
  appendInvariant: ReturnType<typeof vi.fn>;
} {
  const appendInvariant = vi
    .fn()
    .mockResolvedValue({} as unknown as WitnessEvent);
  const service: IWitnessService = {
    appendAuthorization: vi.fn(),
    appendCompletion: vi.fn(),
    appendInvariant: appendInvariant as unknown as IWitnessService['appendInvariant'],
    createCheckpoint: vi.fn(),
    rotateKeyEpoch: vi.fn(),
    verify: vi.fn(),
    getReport: vi.fn(),
    listReports: vi.fn(),
    getLatestCheckpoint: vi.fn(),
  };
  return { service, appendInvariant };
}

interface ScenarioOpts {
  chainValid?: boolean;
  hasCheckpoint?: boolean;
  retryResult?: RetryPolicyResult;
  rollbackResult?: RollbackPolicyResult;
  retryEvaluatorSpy?: ReturnType<typeof vi.fn>;
  rollbackEvaluatorSpy?: ReturnType<typeof vi.fn>;
}

function makeContext(
  opts: ScenarioOpts & { witness?: IWitnessService },
  ctxOverrides: Partial<RecoveryOrchestratorContext> = {},
): RecoveryOrchestratorContext {
  const checkpoint = opts.hasCheckpoint === false ? null : makeCheckpoint();
  const checkpointManager: ICheckpointManager = {
    prepare: vi.fn(),
    commit: vi.fn(),
    abort: vi.fn(),
    getLastCommitted: vi.fn().mockResolvedValue(checkpoint),
    validateChain: vi
      .fn()
      .mockResolvedValue({ valid: opts.chainValid ?? true }),
  } as unknown as ICheckpointManager;

  const retryEvaluator: IRetryPolicyEvaluator = {
    evaluate:
      opts.retryEvaluatorSpy ??
      (vi.fn(
        (_c: RetryEvaluationContext): RetryPolicyResult =>
          opts.retryResult ?? { allowed: true },
      ) as unknown as IRetryPolicyEvaluator['evaluate']),
  };
  const rollbackEvaluator: IRollbackPolicyEvaluator = {
    evaluate:
      opts.rollbackEvaluatorSpy ??
      (vi.fn(
        (_c: RollbackEvaluationContext): RollbackPolicyResult =>
          opts.rollbackResult ?? { allowed: true },
      ) as unknown as IRollbackPolicyEvaluator['evaluate']),
  };

  return {
    run_id: RUN_ID,
    project_id: PROJECT_ID,
    failure_class: 'retryable_transient',
    ledger_store: {} as RecoveryOrchestratorContext['ledger_store'],
    checkpoint_manager: checkpointManager,
    retry_evaluator: retryEvaluator,
    rollback_evaluator: rollbackEvaluator,
    witness: opts.witness,
    ...ctxOverrides,
  };
}

function eventTypes(
  spy: ReturnType<typeof vi.fn>,
): string[] {
  return spy.mock.calls.map((args) => {
    const input = args[0] as WitnessInvariantInput;
    const detail = input.detail as { event_type?: string };
    return detail.event_type ?? '';
  });
}

function lastInputs(
  spy: ReturnType<typeof vi.fn>,
): WitnessInvariantInput[] {
  return spy.mock.calls.map((args) => args[0] as WitnessInvariantInput);
}

// =============================================================================
// UT-SP8-EM-* — emission-per-decision-point unit tests (16 tests)
// =============================================================================

describe('RecoveryOrchestrator emission per decision point (UT-SP8-EM-*)', () => {
  // UT-SP8-EM-START — fr_recovery_started emitted at the top of every run().
  it('UT-SP8-EM-START emits fr_recovery_started at top of run', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    expect(eventTypes(appendInvariant)[0]).toBe('fr_recovery_started');
  });

  // UT-SP8-EM-CHAINI — chain-invalid path emits fr_recovery_blocked_review_required
  // with reason 'chain_invalid'.
  it('UT-SP8-EM-CHAINI emits chain_invalid blocked-review terminal', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({ witness: service, chainValid: false }),
    );
    expect(result).toBe('recovery_blocked_review_required');
    const types = eventTypes(appendInvariant);
    expect(types).toEqual([
      'fr_recovery_started',
      'fr_recovery_blocked_review_required',
    ]);
    const last = lastInputs(appendInvariant)[1];
    expect((last.detail as { reason?: string }).reason).toBe('chain_invalid');
  });

  // UT-SP8-EM-CONTEXT — fr_recovery_context_resolved emitted after chain-valid.
  it('UT-SP8-EM-CONTEXT emits fr_recovery_context_resolved post chain-validate', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    expect(eventTypes(appendInvariant)).toContain('fr_recovery_context_resolved');
  });

  // UT-SP8-EM-NOCHK — no-checkpoint emits fr_recovery_failed_hard_stop with reason 'no_checkpoint'.
  it('UT-SP8-EM-NOCHK emits no_checkpoint failed_hard_stop terminal', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({ witness: service, hasCheckpoint: false }),
    );
    expect(result).toBe('recovery_failed_hard_stop');
    const types = eventTypes(appendInvariant);
    expect(types).toEqual([
      'fr_recovery_started',
      'fr_recovery_context_resolved',
      'fr_recovery_failed_hard_stop',
    ]);
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { reason?: string }).reason).toBe('no_checkpoint');
  });

  // UT-SP8-EM-CKPT — fr_recovery_checkpoint_captured emitted on happy path.
  it('UT-SP8-EM-CKPT emits fr_recovery_checkpoint_captured', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    expect(eventTypes(appendInvariant)).toContain(
      'fr_recovery_checkpoint_captured',
    );
  });

  // UT-SP8-EM-RETSCHED — fr_recovery_retry_scheduled emitted before retry evaluator.
  it('UT-SP8-EM-RETSCHED emits fr_recovery_retry_scheduled before retry evaluator', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    const types = eventTypes(appendInvariant);
    const sched = types.indexOf('fr_recovery_retry_scheduled');
    const att = types.indexOf('fr_recovery_retry_attempted');
    expect(sched).toBeGreaterThanOrEqual(0);
    expect(att).toBeGreaterThan(sched);
  });

  // UT-SP8-EM-RETATT — fr_recovery_retry_attempted emitted after retry evaluator.
  it('UT-SP8-EM-RETATT emits fr_recovery_retry_attempted after retry evaluator', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    expect(eventTypes(appendInvariant)).toContain('fr_recovery_retry_attempted');
  });

  // UT-SP8-EM-RE1 — N3 closure: retry-escalate emits fr_recovery_dispatched_to_principal
  // (NOT fr_recovery_blocked_review_required) AND terminal state is recovery_blocked_review_required.
  // The discriminating event-type ≠ terminal-state pair is the SP 10 UX consumer-rendering signal.
  it('UT-SP8-EM-RE1 retry-escalate uses dispatched_to_principal event-type with blocked-review terminal (N3)', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        retryResult: { allowed: false, reason: 'escalate' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
    const types = eventTypes(appendInvariant);
    expect(types).toContain('fr_recovery_dispatched_to_principal');
    expect(types).not.toContain('fr_recovery_blocked_review_required');
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { event_type?: string }).event_type).toBe(
      'fr_recovery_dispatched_to_principal',
    );
    expect((last.detail as { reason?: string }).reason).toBe('retry_escalate');
  });

  // UT-SP8-EM-RB1 — retry-blocked terminal blocked-review with reason 'retry_blocked'.
  it('UT-SP8-EM-RB1 retry-blocked emits blocked-review with retry_blocked reason', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        retryResult: { allowed: false, reason: 'retry_blocked' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { event_type?: string }).event_type).toBe(
      'fr_recovery_blocked_review_required',
    );
    expect((last.detail as { reason?: string }).reason).toBe('retry_blocked');
  });

  // UT-SP8-EM-RBSTART — fr_recovery_rollback_started emitted before rollback eval.
  it('UT-SP8-EM-RBSTART emits fr_recovery_rollback_started before rollback evaluator', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    const types = eventTypes(appendInvariant);
    const start = types.indexOf('fr_recovery_rollback_started');
    const applied = types.indexOf('fr_recovery_rollback_applied');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(applied).toBeGreaterThan(start);
  });

  // UT-SP8-EM-RBAPPLIED — fr_recovery_rollback_applied emitted after rollback eval.
  it('UT-SP8-EM-RBAPPLIED emits fr_recovery_rollback_applied after rollback evaluator', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(makeContext({ witness: service }));
    expect(eventTypes(appendInvariant)).toContain(
      'fr_recovery_rollback_applied',
    );
  });

  // UT-SP8-EM-RBR — rollback review_required → blocked-review terminal.
  it('UT-SP8-EM-RBR rollback review_required emits blocked-review with rollback_review_required reason', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        rollbackResult: { allowed: false, reason: 'review_required' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { reason?: string }).reason).toBe(
      'rollback_review_required',
    );
  });

  // UT-SP8-EM-RBLOCK — rollback rollback_blocked → failed-hard-stop terminal.
  it('UT-SP8-EM-RBLOCK rollback rollback_blocked emits failed_hard_stop with rollback_blocked reason', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        rollbackResult: { allowed: false, reason: 'rollback_blocked' },
      }),
    );
    expect(result).toBe('recovery_failed_hard_stop');
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { event_type?: string }).event_type).toBe(
      'fr_recovery_failed_hard_stop',
    );
    expect((last.detail as { reason?: string }).reason).toBe('rollback_blocked');
  });

  // UT-SP8-EM-COMP1 — N1 closure: compensation pair emission ordering (NOT execution).
  // Asserts emission ORDERING (compensation_started → compensation_applied →
  // terminal blocked-review-required(reason: compensation_required)), NOT
  // compensation execution. The V1 orchestrator marks the decision-point reach
  // without an intervening compensation step; a future SP introducing actual
  // compensation execution will straddle the new step naturally.
  it('UT-SP8-EM-COMP1 compensation pair emits in order then terminal blocked-review (N1)', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        rollbackResult: { allowed: false, reason: 'compensation_required' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
    const types = eventTypes(appendInvariant);
    const compStart = types.indexOf('fr_recovery_compensation_started');
    const compApplied = types.indexOf('fr_recovery_compensation_applied');
    const terminal = types.lastIndexOf('fr_recovery_blocked_review_required');
    expect(compStart).toBeGreaterThanOrEqual(0);
    expect(compApplied).toBe(compStart + 1);
    expect(terminal).toBe(compApplied + 1);
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { reason?: string }).reason).toBe(
      'compensation_required',
    );
  });

  // UT-SP8-EM-COMPLETED — happy path reaches fr_recovery_completed.
  it('UT-SP8-EM-COMPLETED happy path emits fr_recovery_completed terminal', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(makeContext({ witness: service }));
    expect(result).toBe('recovery_completed');
    const last = lastInputs(appendInvariant).at(-1)!;
    expect((last.detail as { event_type?: string }).event_type).toBe(
      'fr_recovery_completed',
    );
    // No reason on happy-path completion.
    expect((last.detail as { reason?: string }).reason).toBeUndefined();
  });

  // UT-SP8-EM-FAILSTOP — failed_hard_stop terminal payload shape (no_checkpoint variant).
  it('UT-SP8-EM-FAILSTOP failed_hard_stop terminal payload conforms to SP 2 contract', async () => {
    const { service, appendInvariant } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext({ witness: service, hasCheckpoint: false }),
    );
    const last = lastInputs(appendInvariant).at(-1)!;
    expect(last.code).toBe('RECOVERY-EVT');
    expect(last.actionCategory).toBe('recovery-evidence');
    expect(last.actionRef).toBe(RUN_ID);
    expect(last.projectId).toBe(PROJECT_ID);
    expect(last.actor).toBe('system');
    const detail = last.detail as {
      event_type: string;
      run_id: string;
      project_id: string;
      evidence_refs: unknown[];
      reason?: string;
    };
    expect(detail.event_type).toBe('fr_recovery_failed_hard_stop');
    expect(detail.run_id).toBe(RUN_ID);
    expect(detail.project_id).toBe(PROJECT_ID);
    expect(detail.evidence_refs).toEqual([]);
    expect(detail.reason).toBe('no_checkpoint');
  });
});

// =============================================================================
// UT-SP8-TERM-* — terminal-state convergence (3 tests)
// =============================================================================

describe('RecoveryOrchestrator terminal-state convergence (UT-SP8-TERM-*)', () => {
  it('UT-SP8-TERM-COMPLETED happy path returns recovery_completed', async () => {
    const { service } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(makeContext({ witness: service }));
    expect(result).toBe('recovery_completed');
  });

  it('UT-SP8-TERM-BLOCKED retry-blocked returns recovery_blocked_review_required', async () => {
    const { service } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: service,
        retryResult: { allowed: false, reason: 'retry_blocked' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
  });

  it('UT-SP8-TERM-FAILED no-checkpoint returns recovery_failed_hard_stop', async () => {
    const { service } = makeMockWitness();
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({ witness: service, hasCheckpoint: false }),
    );
    expect(result).toBe('recovery_failed_hard_stop');
  });
});

// =============================================================================
// UT-SP8-CTX-* — context-field consumption (5 tests)
// =============================================================================

describe('RecoveryOrchestrator context-field consumption (UT-SP8-CTX-*)', () => {
  it('UT-SP8-CTX-RB-OVERRIDE retry_budget override flows into retry evaluator', async () => {
    const { service } = makeMockWitness();
    const retrySpy = vi.fn(
      (_c: RetryEvaluationContext): RetryPolicyResult => ({ allowed: true }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext(
        { witness: service, retryEvaluatorSpy: retrySpy },
        { retry_budget: 5 },
      ),
    );
    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(retrySpy.mock.calls[0]![0]).toMatchObject({ retry_budget: 5 });
  });

  it('UT-SP8-CTX-RB-DEFAULT retry_budget default 3 when context omits field', async () => {
    const { service } = makeMockWitness();
    const retrySpy = vi.fn(
      (_c: RetryEvaluationContext): RetryPolicyResult => ({ allowed: true }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext({ witness: service, retryEvaluatorSpy: retrySpy }),
    );
    expect(retrySpy.mock.calls[0]![0]).toMatchObject({ retry_budget: 3 });
  });

  // UT-SP8-CTX-OPCLASS-OVERRIDE — IP-N2: orchestrator's operation_class override
  // does NOT route into the rollback-evaluator's disjoint value-set. The arg is
  // preserved as the literal 'reversible'.
  it('UT-SP8-CTX-OPCLASS-OVERRIDE rollback evaluator gets literal reversible regardless of context.operation_class (IP-N2)', async () => {
    const { service } = makeMockWitness();
    const rollbackSpy = vi.fn(
      (_c: RollbackEvaluationContext): RollbackPolicyResult => ({
        allowed: true,
      }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext(
        { witness: service, rollbackEvaluatorSpy: rollbackSpy },
        { operation_class: 'irreversible' },
      ),
    );
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(rollbackSpy.mock.calls[0]![0]).toMatchObject({
      operation_class: 'reversible',
    });
  });

  // UT-SP8-CTX-OPCLASS-DEFAULT — orchestrator default 'reversible' when context omits;
  // rollback-evaluator arg also 'reversible'.
  it('UT-SP8-CTX-OPCLASS-DEFAULT rollback evaluator gets reversible when context.operation_class omitted', async () => {
    const { service } = makeMockWitness();
    const rollbackSpy = vi.fn(
      (_c: RollbackEvaluationContext): RollbackPolicyResult => ({
        allowed: true,
      }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext({ witness: service, rollbackEvaluatorSpy: rollbackSpy }),
    );
    expect(rollbackSpy.mock.calls[0]![0]).toMatchObject({
      operation_class: 'reversible',
    });
  });

  // UT-SP8-CTX-OPCLASS-DISJOINT — IP-N2 lock: even with a non-RecoveryOperationClass
  // value in context.operation_class ('side-effect-producing'), the rollback-evaluator
  // arg STILL gets literal 'reversible'. Asserts the call-boundary disjunction.
  it('UT-SP8-CTX-OPCLASS-DISJOINT rollback evaluator gets reversible with side-effect-producing context (IP-N2 disjunction lock)', async () => {
    const { service } = makeMockWitness();
    const rollbackSpy = vi.fn(
      (_c: RollbackEvaluationContext): RollbackPolicyResult => ({
        allowed: true,
      }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext(
        { witness: service, rollbackEvaluatorSpy: rollbackSpy },
        { operation_class: 'side-effect-producing' },
      ),
    );
    expect(rollbackSpy.mock.calls[0]![0]).toMatchObject({
      operation_class: 'reversible',
    });
  });

  // UT-SP8-CTX-SES-DISJOINT — SUPV-SP8-008 Hazard 1 lock: orchestrator's
  // side_effect_status value-set is disjoint from rollback-evaluator's; the arg
  // STILL gets literal 'idempotent' regardless of context value.
  it('UT-SP8-CTX-SES-DISJOINT rollback evaluator gets idempotent regardless of context.side_effect_status (Hazard 1 lock)', async () => {
    const { service } = makeMockWitness();
    const rollbackSpy = vi.fn(
      (_c: RollbackEvaluationContext): RollbackPolicyResult => ({
        allowed: true,
      }),
    ) as ReturnType<typeof vi.fn>;
    const orchestrator = new RecoveryOrchestrator();
    await orchestrator.run(
      makeContext(
        { witness: service, rollbackEvaluatorSpy: rollbackSpy },
        { side_effect_status: 'partially-applied' },
      ),
    );
    expect(rollbackSpy.mock.calls[0]![0]).toMatchObject({
      side_effect_status: 'idempotent',
    });
  });
});

// =============================================================================
// UT-SP8-UNWIRED-* — unwired-witness branch (3 tests; SUPV-SP8-010 / SUPV-SP8-020)
// =============================================================================

describe('RecoveryOrchestrator unwired-witness branch (UT-SP8-UNWIRED-*)', () => {
  it('UT-SP8-UNWIRED-COMPLETED completes happy path silently with witness undefined', async () => {
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({ witness: undefined }),
    );
    expect(result).toBe('recovery_completed');
  });

  it('UT-SP8-UNWIRED-BLOCKED retry-blocked returns blocked-review with witness undefined', async () => {
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({
        witness: undefined,
        retryResult: { allowed: false, reason: 'retry_blocked' },
      }),
    );
    expect(result).toBe('recovery_blocked_review_required');
  });

  it('UT-SP8-UNWIRED-FAILED no-checkpoint returns failed_hard_stop with witness undefined', async () => {
    const orchestrator = new RecoveryOrchestrator();
    const result = await orchestrator.run(
      makeContext({ witness: undefined, hasCheckpoint: false }),
    );
    expect(result).toBe('recovery_failed_hard_stop');
  });
});
