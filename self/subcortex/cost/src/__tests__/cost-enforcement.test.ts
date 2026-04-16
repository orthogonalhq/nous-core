import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ControlCommandEnvelopeSchema } from '@nous/shared';
import { CostEnforcement, type IOpctlServiceForEnforcement } from '../cost-enforcement.js';

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
    enforcement = new CostEnforcement({ opctlService });
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
    enforcement = new CostEnforcement({ opctlService });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).not.toHaveBeenCalled();
  });

  it('prevents double-pause when project is hard_stopped', async () => {
    opctlService = createMockOpctlService('hard_stopped');
    enforcement = new CostEnforcement({ opctlService });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).not.toHaveBeenCalled();
  });

  it('triggers pause for running projects', async () => {
    opctlService = createMockOpctlService('running');
    enforcement = new CostEnforcement({ opctlService });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
    const envelope = (opctlService.submitCommand as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(envelope.actor_type).toBe('system_agent');
    expect(envelope.action).toBe('pause');
    expect(envelope.scope.project_id).toBe(TEST_PROJECT_ID);
  });

  it('triggers pause for resuming projects', async () => {
    opctlService = createMockOpctlService('resuming');
    enforcement = new CostEnforcement({ opctlService });

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
    enforcement = new CostEnforcement({ opctlService });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    const log = enforcement.getEnforcementLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.success).toBe(false);
  });

  it('proceeds with pause when getProjectControlState throws', async () => {
    opctlService.getProjectControlState = vi.fn().mockRejectedValue(new Error('state check failed'));
    enforcement = new CostEnforcement({ opctlService });

    await enforcement.triggerPause(TEST_PROJECT_ID, 150, 100);

    // Should still attempt to submit despite state check failure
    expect(opctlService.submitCommand).toHaveBeenCalledOnce();
  });
});
