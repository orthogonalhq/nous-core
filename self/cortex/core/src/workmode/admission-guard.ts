/**
 * Workmode admission guard implementation.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Enforces authority chain: nous_cortex -> orchestration_agent -> worker_agent
 */
import type {
  AdmissionResult,
  InvariantCode,
} from '@nous/shared';
import type {
  IWorkmodeAdmissionGuard,
  DispatchAdmissionInput,
  LifecycleAdmissionInput,
  AuthorityActor,
} from '@nous/shared';
import { evaluateLifecycleAdmission } from './lifecycle-admission.js';

/** Authority chain order (index = authority level, higher = more authority) */
const AUTHORITY_ORDER: Record<AuthorityActor, number> = {
  nous_cortex: 2,
  orchestration_agent: 1,
  worker_agent: 0,
};

/** Valid dispatch edges: source may dispatch to target only if source has higher authority */
const VALID_DISPATCH_EDGES: Array<[AuthorityActor, AuthorityActor]> = [
  ['nous_cortex', 'orchestration_agent'],
  ['nous_cortex', 'worker_agent'],
  ['orchestration_agent', 'worker_agent'],
];

export class WorkmodeAdmissionGuard implements IWorkmodeAdmissionGuard {
  evaluateDispatchAdmission(input: DispatchAdmissionInput): AdmissionResult {
    const { sourceActor, targetActor } = input;

    // WMODE-010: worker_agent cannot escalate or dispatch authoritative agents
    if (sourceActor === 'worker_agent') {
      return {
        allowed: false,
        reasonCode: 'WMODE-010' as InvariantCode,
        evidenceRefs: [`worker cannot dispatch; source=${sourceActor} target=${targetActor}`],
      };
    }

    // WMODE-003: orchestration_agent nesting forbidden
    if (sourceActor === 'orchestration_agent' && targetActor === 'orchestration_agent') {
      return {
        allowed: false,
        reasonCode: 'WMODE-003' as InvariantCode,
        evidenceRefs: ['nested orchestration forbidden'],
      };
    }

    // WMODE-002: authority must narrow down-chain
    const sourceLevel = AUTHORITY_ORDER[sourceActor];
    const targetLevel = AUTHORITY_ORDER[targetActor];
    if (sourceLevel <= targetLevel) {
      return {
        allowed: false,
        reasonCode: 'WMODE-002' as InvariantCode,
        evidenceRefs: [`authority widening blocked; source=${sourceActor} target=${targetActor}`],
      };
    }

    // Check valid edge
    const isValidEdge = VALID_DISPATCH_EDGES.some(
      ([s, t]) => s === sourceActor && t === targetActor,
    );
    if (!isValidEdge) {
      return {
        allowed: false,
        reasonCode: 'WMODE-002' as InvariantCode,
        evidenceRefs: [`invalid dispatch edge; source=${sourceActor} target=${targetActor}`],
      };
    }

    return { allowed: true };
  }

  evaluateLifecycleAdmission(input: LifecycleAdmissionInput): AdmissionResult {
    return evaluateLifecycleAdmission(
      input.action,
      input.controlState,
      input.confirmationProof != null,
    );
  }
}
