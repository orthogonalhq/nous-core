/**
 * Lifecycle admission matrix for project control actions.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Aligns with ADR-004 operator control command integrity.
 */
import type { ProjectControlState } from '@nous/shared';
import type { LifecycleAction } from '@nous/shared';
import type { AdmissionResult } from '@nous/shared';

/** Valid control state transitions per action. */
const VALID_TRANSITIONS: Record<
  LifecycleAction,
  ProjectControlState[] | 'any'
> = {
  start: ['hard_stopped', 'paused_review', 'resuming'],
  pause: ['running'],
  resume: ['paused_review', 'resuming'],
  stop: 'any',
  recover: ['hard_stopped'],
};

/**
 * Evaluate lifecycle admission.
 * Fail-closed: unknown control state or missing confirmation proof denies.
 */
export function evaluateLifecycleAdmission(
  action: LifecycleAction,
  controlState: ProjectControlState | undefined,
  hasConfirmationProof: boolean,
): AdmissionResult {
  if (controlState === undefined) {
    return {
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED' as import('@nous/shared').InvariantCode,
      evidenceRefs: ['control-state-undefined'],
    };
  }

  const validStates = VALID_TRANSITIONS[action];
  if (validStates !== 'any') {
    if (!validStates.includes(controlState)) {
      return {
        allowed: false,
        reasonCode: 'OPCTL-INVALID-STATE' as import('@nous/shared').InvariantCode,
        evidenceRefs: [`action=${action}, state=${controlState}`],
      };
    }
  }

  if (!hasConfirmationProof) {
    return {
      allowed: false,
      reasonCode: 'OPCTL-CONFIRMATION-REQUIRED' as import('@nous/shared').InvariantCode,
      evidenceRefs: [`action=${action}`],
    };
  }

  return { allowed: true };
}
