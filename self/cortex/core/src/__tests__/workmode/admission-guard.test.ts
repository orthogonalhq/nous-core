/**
 * Admission guard behavior tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import { WorkmodeAdmissionGuard } from '../../workmode/admission-guard.js';

describe('WorkmodeAdmissionGuard', () => {
  const guard = new WorkmodeAdmissionGuard();

  describe('evaluateDispatchAdmission', () => {
    it('allows cortex -> orchestration_agent', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'nous_cortex',
        targetActor: 'orchestration_agent',
        action: 'dispatch',
      });
      expect(result.allowed).toBe(true);
    });

    it('allows cortex -> worker_agent', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'nous_cortex',
        targetActor: 'worker_agent',
        action: 'execute',
      });
      expect(result.allowed).toBe(true);
    });

    it('allows orchestration_agent -> worker_agent', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'execute_subphase',
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks worker_agent -> orchestration_agent (WMODE-010)', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'worker_agent',
        targetActor: 'orchestration_agent',
        action: 'dispatch',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-010');
        expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('blocks orchestration_agent -> orchestration_agent (WMODE-003)', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'orchestration_agent',
        targetActor: 'orchestration_agent',
        action: 'nested',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-003');
      }
    });

    it('blocks worker_agent -> worker_agent (WMODE-010)', () => {
      const result = guard.evaluateDispatchAdmission({
        sourceActor: 'worker_agent',
        targetActor: 'worker_agent',
        action: 'dispatch',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-010');
      }
    });
  });

  describe('evaluateLifecycleAdmission', () => {
    it('denies when control state is undefined', () => {
      const result = guard.evaluateLifecycleAdmission({
        action: 'start',
        projectId: 'proj-1',
        controlState: undefined,
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('POL-CONTROL-STATE-BLOCKED');
      }
    });

    it('denies when confirmation proof is missing', () => {
      const result = guard.evaluateLifecycleAdmission({
        action: 'pause',
        projectId: 'proj-1',
        controlState: 'running',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('OPCTL-CONFIRMATION-REQUIRED');
      }
    });

    it('allows when control state and proof are valid', () => {
      const result = guard.evaluateLifecycleAdmission({
        action: 'pause',
        projectId: 'proj-1',
        controlState: 'running',
        confirmationProof: {
          proof_id: '550e8400-e29b-41d4-a716-446655440000',
          scope_hash: 'a'.repeat(64),
          action: 'pause',
          tier: 'T1',
          signature: 'sig',
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      });
      expect(result.allowed).toBe(true);
    });
  });
});
