/**
 * Phase 5.1 authority-chain and invariant violation tests.
 *
 * WMODE-002, WMODE-003, WMODE-010 enforcement.
 */
import { describe, it, expect } from 'vitest';
import { WorkmodeAdmissionGuard } from '../../workmode/admission-guard.js';

describe('Phase 5.1 authority-chain invariants', () => {
  const guard = new WorkmodeAdmissionGuard();

  it('WMODE-002: blocks authority widening (orchestrator dispatching to cortex)', () => {
    const result = guard.evaluateDispatchAdmission({
      sourceActor: 'orchestration_agent',
      targetActor: 'nous_cortex',
      action: 'escalate',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('WMODE-002');
    if (!result.allowed) {
      expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('WMODE-003: blocks nested orchestration', () => {
    const result = guard.evaluateDispatchAdmission({
      sourceActor: 'orchestration_agent',
      targetActor: 'orchestration_agent',
      action: 'delegate',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('WMODE-003');
  });

  it('WMODE-010: worker cannot dispatch to any authoritative agent', () => {
    const toOrchestrator = guard.evaluateDispatchAdmission({
      sourceActor: 'worker_agent',
      targetActor: 'orchestration_agent',
      action: 'request',
    });
    expect(toOrchestrator.allowed).toBe(false);
    expect(toOrchestrator.reasonCode).toBe('WMODE-010');

    const toCortex = guard.evaluateDispatchAdmission({
      sourceActor: 'worker_agent',
      targetActor: 'nous_cortex',
      action: 'escalate',
    });
    expect(toCortex.allowed).toBe(false);
    expect(toCortex.reasonCode).toBe('WMODE-010');
  });
});
