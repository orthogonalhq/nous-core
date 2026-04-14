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

  describe('evaluateScopeGuard', () => {
    it('allows valid scope with consistent execution context', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'dispatch',
        executionContext: {
          workmodeId: 'system:implementation',
          agentClass: 'Orchestrator',
        },
      });
      expect(result.allowed).toBe(true);
    });

    it('allows non-scope-requiring action without execution context', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'query',
      });
      expect(result.allowed).toBe(true);
    });

    it('handles missing execution context gracefully for non-scope actions', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'nous_cortex',
        targetActor: 'orchestration_agent',
        action: 'status_check',
      });
      expect(result.allowed).toBe(true);
    });

    it('denies scope-requiring action without execution context (fail-close)', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'execute_subphase',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-SCOPE-GUARD-VIOLATION');
        expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
        expect(result.evidenceRefs[0]).toContain('execute_subphase');
      }
    });

    it('denies scope-requiring action with missing workmodeId', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'execute_node',
        executionContext: {
          nodeDefinitionId: 'node-1',
        },
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-SCOPE-GUARD-VIOLATION');
        expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
        expect(result.evidenceRefs[0]).toContain('workmodeId');
      }
    });

    it('rejects structurally invalid scope — agentClass/sourceActor mismatch (WMODE-PACKET-ADMISSIBILITY-REJECTED)', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'dispatch',
        executionContext: {
          workmodeId: 'system:implementation',
          agentClass: 'Worker',
        },
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-PACKET-ADMISSIBILITY-REJECTED');
        expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
        expect(result.evidenceRefs[0]).toContain('agentClass');
      }
    });

    it('fail-close denial always includes evidenceRefs', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'nous_cortex',
        targetActor: 'orchestration_agent',
        action: 'dispatch',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(Array.isArray(result.evidenceRefs)).toBe(true);
        expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('allows scope-requiring action with all executionContext fields populated', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'nous_cortex',
        targetActor: 'orchestration_agent',
        action: 'dispatch',
        executionContext: {
          nodeDefinitionId: 'node-42',
          workmodeId: 'system:implementation',
          agentClass: 'Cortex::Principal',
        },
      });
      expect(result.allowed).toBe(true);
    });

    it('allows scope-requiring action with partial executionContext (workmodeId present)', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'execute_subphase',
        executionContext: {
          workmodeId: 'system:implementation',
        },
      });
      expect(result.allowed).toBe(true);
    });

    it('treats dispatch_worker as scope-requiring (CF-002 action string alignment)', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'dispatch_worker',
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reasonCode).toBe('WMODE-SCOPE-GUARD-VIOLATION');
        expect(result.evidenceRefs[0]).toContain('dispatch_worker');
      }
    });

    it('allows dispatch_worker with valid execution context', () => {
      const result = guard.evaluateScopeGuard({
        sourceActor: 'orchestration_agent',
        targetActor: 'worker_agent',
        action: 'dispatch_worker',
        executionContext: {
          workmodeId: 'system:implementation',
          agentClass: 'Orchestrator',
        },
      });
      expect(result.allowed).toBe(true);
    });
  });
});
