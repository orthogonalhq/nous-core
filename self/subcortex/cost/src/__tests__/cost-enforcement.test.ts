import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ControlCommandEnvelopeSchema, ConfirmationProofSchema } from '@nous/shared';
import { CostEnforcement, type IOpctlServiceForEnforcement, type EnforcementRecord } from '../cost-enforcement.js';

const TEST_PROJECT_ID = '00000000-0000-4000-a000-000000000001';

function createMockOpctlService(controlState: string = 'running'): IOpctlServiceForEnforcement {
  return {
    getProjectControlState: vi.fn().mockResolvedValue(controlState),
    submitCommand: vi.fn().mockResolvedValue({
      status: 'applied',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      target_ids_hash: 'a'.repeat(64),
    }),
  };
}

describe('CostEnforcement', () => {
  let opctlService: ReturnType<typeof createMockOpctlService>;
  let enforcement: CostEnforcement;

  beforeEach(() => {
    opctlService = createMockOpctlService('running');
    // Pre-SP-7 behavior parity: existing tests exercise the enabled branch.
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });
  });

  it('constructs a valid ControlCommandEnvelope', async () => {
    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
    const envelope = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // Must pass full Zod schema validation
    const result = ControlCommandEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);

    // Verify specific fields
    expect(envelope.actor_type).toBe('system_agent');
    expect(envelope.action).toBe('pause');
    expect(envelope.scope.class).toBe('project_run_scope');
    expect(envelope.scope.kind).toBe('project_run');
    expect(envelope.scope.project_id).toBe(TEST_PROJECT_ID);
    expect(envelope.command_signature).toBe('cost-governance-system-sig');
    expect(envelope.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.payload).toEqual({
      reason: 'Budget hard ceiling exceeded',
      spendAtTrigger: 150,
      ceilingUsd: 100,
    });
  });

  it('prevents double-pause when project is paused_review', async () => {
    opctlService = createMockOpctlService('paused_review');
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).not.toHaveBeenCalled();
  });

  it('prevents double-pause when project is hard_stopped', async () => {
    opctlService = createMockOpctlService('hard_stopped');
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).not.toHaveBeenCalled();
  });

  it('triggers pause for running projects', async () => {
    opctlService = createMockOpctlService('running');
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
    const envelope = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(envelope.actor_type).toBe('system_agent');
    expect(envelope.action).toBe('pause');
    expect(envelope.scope.project_id).toBe(TEST_PROJECT_ID);
  });

  it('triggers pause for resuming projects', async () => {
    opctlService = createMockOpctlService('resuming');
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
  });

  it('records enforcement action in log', async () => {
    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      projectId: TEST_PROJECT_ID,
      spendAtTrigger: 150,
      ceilingUsd: 100,
      success: true,
    });
    expect(log[0]!.timestamp).toBeGreaterThan(0);
  });

  it('records failed enforcement when submitCommand throws', async () => {
    opctlService.submitCommand = vi.fn().mockRejectedValue(new Error('submit failed'));
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
  });

  it('proceeds with pause when getProjectControlState throws', async () => {
    opctlService.getProjectControlState = vi.fn().mockRejectedValue(new Error('state check failed'));
    enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    // Should still attempt to submit despite state check failure
    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// WR-162 SP 7 — enforcementEnabled flag branches (UT-SP7-CE1..CE5)
// ---------------------------------------------------------------------------

describe('CostEnforcement — enforcementEnabled flag (SP 7)', () => {
  // UT-SP7-CE1: enforcementEnabled=false → skip record, no submit
  it('skips submit and records { skipped: true, reason_code: "enforcement_disabled" } when enforcementEnabled=false', async () => {
    const opctlService = createMockOpctlService('running');
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: false });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).not.toHaveBeenCalled();
    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      projectId: TEST_PROJECT_ID,
      spendAtTrigger: 150,
      ceilingUsd: 100,
      success: false,
      skipped: true,
      reason_code: 'enforcement_disabled',
    });
  });

  // UT-SP7-CE2: enforcementEnabled=true + status='applied' → success:true, no skipped, no reason_code
  it('submits with system-issued proof and records { success: true } on status=applied', async () => {
    const opctlService = createMockOpctlService('running');
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
    const call = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // Call shape: (envelope, proof)
    expect(call).toHaveLength(2);
    const envelope = call[0];
    const proof = call[1];
    expect(envelope.action).toBe('pause');
    // Proof must be a valid ConfirmationProof with the system-issued-stub-sig literal
    const parsed = ConfirmationProofSchema.safeParse(proof);
    expect(parsed.success).toBe(true);
    expect(proof.signature).toBe('system-issued-stub-sig');
    expect(proof.action).toBe('pause');

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(true);
    expect(log[0]!.skipped).toBeUndefined();
    expect(log[0]!.reason_code).toBeUndefined();
  });

  // UT-SP7-CE3: enforcementEnabled=true + status='blocked' → success:false, reason_code:'blocked'
  it('records { success: false, reason_code: "blocked" } on status=blocked', async () => {
    const opctlService = createMockOpctlService('running');
    opctlService.submitCommand = vi.fn().mockResolvedValue({
      status: 'blocked',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      reason: 'scope locked',
      reason_code: 'scope_locked',
    });
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
    expect(log[0]!.reason_code).toBe('blocked');
    expect(log[0]!.skipped).toBeUndefined();
  });

  // UT-SP7-CE4: enforcementEnabled=true + status='rejected' → success:false, reason_code:'rejected'
  it('records { success: false, reason_code: "rejected" } on status=rejected', async () => {
    const opctlService = createMockOpctlService('running');
    opctlService.submitCommand = vi.fn().mockResolvedValue({
      status: 'rejected',
      control_command_id: '00000000-0000-0000-0000-000000000000',
      reason: 'envelope invalid',
      reason_code: 'envelope_invalid',
    });
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
    expect(log[0]!.reason_code).toBe('rejected');
    expect(log[0]!.skipped).toBeUndefined();
  });

  // UT-SP7-CE5: enforcementEnabled=true + submitCommand throws → success:false, no reason_code
  it('records { success: false } with NO reason_code when submitCommand throws (SUPV-SP7-010)', async () => {
    const opctlService = createMockOpctlService('running');
    opctlService.submitCommand = vi.fn().mockRejectedValue(new Error('network failure'));
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
    expect(log[0]!.reason_code).toBeUndefined();
    expect(log[0]!.skipped).toBeUndefined();
  });

  // UT-SP7-CE6 (bonus): unknown status surfaces as contract defect throw — caught by try/catch,
  // records { success: false } with NO reason_code (matches catch semantics).
  it('treats unknown OpctlSubmitResult.status as contract defect (throws; catch records { success: false, no reason_code })', async () => {
    const opctlService = createMockOpctlService('running');
    opctlService.submitCommand = vi.fn().mockResolvedValue({
      status: 'deferred', // unknown future-widening status
      control_command_id: '00000000-0000-0000-0000-000000000000',
    });
    const enforcement = new CostEnforcement({ opctlService, enforcementEnabled: true });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
    expect(log[0]!.reason_code).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WR-162 SP 7 — EnforcementRecord additive widening (UT-SP7-ER1..ER2)
// ---------------------------------------------------------------------------

describe('EnforcementRecord — additive widening (SP 7)', () => {
  // UT-SP7-ER1: new optional fields type-check + serialize
  it('accepts new optional fields { skipped, reason_code }', () => {
    const record: EnforcementRecord = {
      timestamp: 1234567890,
      projectId: TEST_PROJECT_ID,
      spendAtTrigger: 150,
      ceilingUsd: 100,
      success: false,
      skipped: true,
      reason_code: 'enforcement_disabled',
    };
    expect(record.skipped).toBe(true);
    expect(record.reason_code).toBe('enforcement_disabled');
    // Round-trip via JSON
    const restored = JSON.parse(JSON.stringify(record)) as EnforcementRecord;
    expect(restored.skipped).toBe(true);
    expect(restored.reason_code).toBe('enforcement_disabled');
  });

  // UT-SP7-ER2: pre-SP-7 legacy record (no skipped/reason_code) still type-checks
  it('accepts legacy record without skipped/reason_code (backwards compat)', () => {
    const legacy: EnforcementRecord = {
      timestamp: 1234567890,
      projectId: TEST_PROJECT_ID,
      spendAtTrigger: 150,
      ceilingUsd: 100,
      success: true,
    };
    expect(legacy.skipped).toBeUndefined();
    expect(legacy.reason_code).toBeUndefined();
    // Round-trip via JSON
    const restored = JSON.parse(JSON.stringify(legacy)) as EnforcementRecord;
    expect(restored.success).toBe(true);
    expect('skipped' in restored).toBe(false);
    expect('reason_code' in restored).toBe(false);
  });
});
