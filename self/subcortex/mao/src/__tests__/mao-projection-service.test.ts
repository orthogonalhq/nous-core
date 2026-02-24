/**
 * MaoProjectionService contract tests.
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 */
import { describe, it, expect } from 'vitest';
import { MaoProjectionService } from '../mao-projection-service.js';
import type { IOpctlService, ProjectId } from '@nous/shared';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111' as ProjectId;

function createMockOpctlService(controlState: 'running' | 'paused_review' | 'hard_stopped' | 'resuming'): IOpctlService {
  return {
    getProjectControlState: async () => controlState,
    hasStartLock: async () => controlState === 'hard_stopped',
    submitCommand: async () =>
      ({ status: 'rejected' as const, control_command_id: '00000000-0000-0000-0000-000000000000' as import('@nous/shared').ControlCommandId, reason: '', reason_code: '' }),
    requestConfirmationProof: async () => ({} as never),
    validateConfirmationProof: async () => false,
    resolveScope: async () => ({} as never),
    setStartLock: async () => {},
  };
}

describe('MaoProjectionService', () => {
  it('getAgentProjections returns empty array when run state unavailable', async () => {
    const svc = new MaoProjectionService({
      opctlService: createMockOpctlService('running'),
    });
    const projections = await svc.getAgentProjections(PROJECT_ID);
    expect(projections).toEqual([]);
  });

  it('getProjectControlProjection derives from opctl getProjectControlState', async () => {
    const svc = new MaoProjectionService({
      opctlService: createMockOpctlService('paused_review'),
    });
    const projection = await svc.getProjectControlProjection(PROJECT_ID);
    expect(projection).not.toBeNull();
    expect(projection!.project_control_state).toBe('paused_review');
    expect(projection!.project_id).toBe(PROJECT_ID);
  });

  it('getProjectControlProjection returns running when opctl says running', async () => {
    const svc = new MaoProjectionService({
      opctlService: createMockOpctlService('running'),
    });
    const projection = await svc.getProjectControlProjection(PROJECT_ID);
    expect(projection!.project_control_state).toBe('running');
  });

  it('getProjectControlProjection returns hard_stopped when opctl says hard_stopped', async () => {
    const svc = new MaoProjectionService({
      opctlService: createMockOpctlService('hard_stopped'),
    });
    const projection = await svc.getProjectControlProjection(PROJECT_ID);
    expect(projection!.project_control_state).toBe('hard_stopped');
  });
});
