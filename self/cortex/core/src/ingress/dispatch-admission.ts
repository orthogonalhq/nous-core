/**
 * Ingress dispatch admission implementation.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Admits validated trigger into run creation path. PCP-007: control state blocks.
 */
import type {
  IngressTriggerEnvelope,
  IngressDispatchOutcome,
  IngressIdempotencyCheckResult,
} from '@nous/shared';
import type {
  IIngressDispatchAdmission,
  IIngressIdempotencyStore,
  IOpctlService,
} from '@nous/shared';
import type { ProjectId } from '@nous/shared';
import { randomUUID } from 'node:crypto';

export interface IngressDispatchAdmissionOptions {
  opctl: IOpctlService | null;
  idempotencyStore: IIngressIdempotencyStore;
}

export class IngressDispatchAdmission implements IIngressDispatchAdmission {
  constructor(private readonly options: IngressDispatchAdmissionOptions) {}

  async admit(
    envelope: IngressTriggerEnvelope,
    idempotencyResult: IngressIdempotencyCheckResult,
  ): Promise<IngressDispatchOutcome> {
    if (idempotencyResult.status === 'duplicate') {
      return {
        outcome: 'accepted_already_dispatched',
        run_id: idempotencyResult.run_id,
        dispatch_ref: idempotencyResult.dispatch_ref,
        evidence_ref: idempotencyResult.evidence_ref,
      };
    }

    if (idempotencyResult.status === 'replay') {
      return {
        outcome: 'rejected',
        reason: 'replay_detected',
        evidence_ref: `ingress:${envelope.trigger_id}`,
        evidence_refs: [`replay:${envelope.source_id}:${envelope.nonce}`],
      };
    }

    // status === 'new': check control state, create run
    const opctl = this.options.opctl;
    if (!opctl) {
      return {
        outcome: 'rejected',
        reason: 'control_state_blocked',
        evidence_ref: `ingress:${envelope.trigger_id}`,
        evidence_refs: ['opctl unavailable; cannot verify control state'],
      };
    }

    const controlState = await opctl.getProjectControlState(
      envelope.project_id as ProjectId,
    );
    if (controlState === 'hard_stopped' || controlState === 'paused_review') {
      return {
        outcome: 'rejected',
        reason: 'control_state_blocked',
        evidence_ref: `ingress:${envelope.trigger_id}`,
        evidence_refs: [`control_state=${controlState} blocks dispatch`],
      };
    }

    const run_id = randomUUID();
    const dispatch_ref = `dispatch:${run_id}`;
    const policy_ref = `policy:${envelope.workflow_ref}`;
    const evidence_ref = `evidence:${envelope.trigger_id}:${run_id}`;

    await this.options.idempotencyStore.recordDispatch(
      envelope,
      run_id,
      dispatch_ref,
      evidence_ref,
    );

    return {
      outcome: 'accepted_dispatched',
      run_id,
      dispatch_ref,
      workflow_ref: envelope.workflow_ref,
      policy_ref,
      evidence_ref,
    };
  }
}
