/**
 * Ingress dispatch admission implementation.
 *
 * Phase 9.3 upgrades dispatch admission from "mint a run id locally" to
 * "complete the canonical ingress-to-workflow-start path" with project lookup,
 * workflow start, and idempotency reservation finalization.
 */
import type {
  AuthorityActor,
  IDocumentStore,
  IProjectStore,
  IWorkflowEngine,
  IngressDispatchOutcome,
  IngressIdempotencyClaimResult,
  IngressTriggerEnvelope,
  ProjectId,
  ProjectControlState,
  TaskExecutionRecord,
  WorkflowDefinitionId,
  WorkflowRunTriggerContext,
} from '@nous/shared';
import type {
  IIngressDispatchAdmission,
  IIngressIdempotencyStore,
  IOpctlService,
} from '@nous/shared';
import type {
  SystemSubmissionReceipt,
  SystemTaskSubmission,
} from '../gateway-runtime/types.js';
import { randomUUID } from 'node:crypto';

const TASK_EXECUTIONS_COLLECTION = 'task_executions';

export interface IngressDispatchAdmissionOptions {
  opctl: IOpctlService | null;
  idempotencyStore: IIngressIdempotencyStore;
  projectStore: IProjectStore;
  workflowEngine: IWorkflowEngine;
  documentStore?: IDocumentStore;
  submitTaskToSystem?: (input: SystemTaskSubmission) => Promise<SystemSubmissionReceipt>;
  sourceActor?: AuthorityActor;
}

export class IngressDispatchAdmission implements IIngressDispatchAdmission {
  constructor(private readonly options: IngressDispatchAdmissionOptions) {}

  private async rejectAndRelease(
    envelope: IngressTriggerEnvelope,
    idempotencyResult: Extract<IngressIdempotencyClaimResult, { status: 'claimed' }>,
    reason: Extract<IngressDispatchOutcome, { outcome: 'rejected' }>['reason'],
    reasonCode: string,
    evidenceRefs: string[],
  ): Promise<IngressDispatchOutcome> {
    await this.options.idempotencyStore.releaseClaim(
      idempotencyResult.reservation_id,
      reasonCode,
    );

    return {
      outcome: 'rejected',
      reason,
      reason_code: reasonCode,
      evidence_ref: `ingress:${envelope.trigger_id}`,
      evidence_refs: evidenceRefs,
    };
  }

  private buildTriggerContext(
    envelope: IngressTriggerEnvelope,
    dispatchRef: string,
    evidenceRef: string,
  ): WorkflowRunTriggerContext {
    return {
      triggerId: envelope.trigger_id,
      triggerType: envelope.trigger_type,
      sourceId: envelope.source_id,
      workflowRef: envelope.workflow_ref ?? envelope.task_ref ?? '',
      workmodeId: envelope.workmode_id,
      idempotencyKey: envelope.idempotency_key,
      dispatchRef,
      evidenceRef,
      occurredAt: envelope.occurred_at,
    };
  }

  async admit(
    envelope: IngressTriggerEnvelope,
    idempotencyResult: IngressIdempotencyClaimResult,
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

    const opctl = this.options.opctl;
    if (!opctl) {
      return this.rejectAndRelease(
        envelope,
        idempotencyResult,
        'control_state_blocked',
        'opctl_unavailable',
        ['opctl unavailable; cannot verify control state'],
      );
    }

    const controlState = await opctl.getProjectControlState(
      envelope.project_id as ProjectId,
    );
    if (controlState === 'hard_stopped' || controlState === 'paused_review') {
      return this.rejectAndRelease(
        envelope,
        idempotencyResult,
        'control_state_blocked',
        `project_control_state_${controlState}`,
        [`control_state=${controlState} blocks dispatch`],
      );
    }

    const projectConfig = await this.options.projectStore.get(
      envelope.project_id as ProjectId,
    );
    if (!projectConfig) {
      return this.rejectAndRelease(
        envelope,
        idempotencyResult,
        'workflow_admission_blocked',
        'project_not_found',
        [`project_id=${envelope.project_id} not found`],
      );
    }

    const runId = idempotencyResult.run_id;
    const dispatchRef = `dispatch:${runId}`;
    const evidenceRef = `evidence:${envelope.trigger_id}:${runId}`;

    // Task-ref routing: dispatch to submitTaskToSystem instead of workflow engine
    if (envelope.task_ref) {
      if (!this.options.submitTaskToSystem || !this.options.documentStore) {
        return this.rejectAndRelease(
          envelope,
          idempotencyResult,
          'workflow_admission_blocked',
          'task_dispatch_unavailable',
          ['submitTaskToSystem or documentStore not configured for task dispatch'],
        );
      }

      const taskDef = (projectConfig.tasks ?? []).find(
        (t) => t.id === envelope.task_ref,
      );
      if (!taskDef) {
        return this.rejectAndRelease(
          envelope,
          idempotencyResult,
          'workflow_admission_blocked',
          'task_definition_not_found',
          [`task_ref=${envelope.task_ref} not found in project ${envelope.project_id}`],
        );
      }

      try {
        const executionId = randomUUID();
        const now = new Date().toISOString();

        // V1: Execution record completion callback is not wired. Records may
        // remain in 'running' status. The dashboard detects stale records by age.
        const executionRecord: TaskExecutionRecord = {
          id: executionId,
          taskDefinitionId: taskDef.id,
          projectId: envelope.project_id,
          triggeredAt: now,
          triggerType: envelope.trigger_type === 'scheduler' ? 'heartbeat' : 'webhook',
          status: 'running',
        };

        await this.options.documentStore.put(
          TASK_EXECUTIONS_COLLECTION,
          executionId,
          executionRecord,
        );

        const receipt = await this.options.submitTaskToSystem({
          task: taskDef.orchestratorInstructions,
          projectId: envelope.project_id,
          detail: {
            taskDefinitionId: taskDef.id,
            taskName: taskDef.name,
            triggerType: executionRecord.triggerType,
            executionId,
            ...(taskDef.context ?? {}),
          },
        });

        await this.options.idempotencyStore.commitDispatch(
          idempotencyResult.reservation_id,
          dispatchRef,
          evidenceRef,
        );

        return {
          outcome: 'accepted_dispatched',
          run_id: receipt.runId as never,
          dispatch_ref: dispatchRef,
          workflow_ref: envelope.task_ref,
          policy_ref: `policy:task:${envelope.task_ref}`,
          evidence_ref: evidenceRef,
        };
      } catch (error) {
        return this.rejectAndRelease(
          envelope,
          idempotencyResult,
          'workflow_admission_blocked',
          'task_dispatch_failed',
          [(error as Error).message],
        );
      }
    }

    // Workflow-ref routing: existing path
    try {
      const startResult = await this.options.workflowEngine.start({
        projectConfig,
        workflowDefinitionId: envelope.workflow_ref as WorkflowDefinitionId,
        runId,
        workmodeId: envelope.workmode_id,
        sourceActor: this.options.sourceActor ?? 'orchestration_agent',
        controlState: controlState as ProjectControlState,
        triggerContext: this.buildTriggerContext(envelope, dispatchRef, evidenceRef),
        admissionEvidenceRefs: [evidenceRef],
        startedAt: envelope.occurred_at,
      });

      if (startResult.status === 'admission_blocked') {
        return this.rejectAndRelease(
          envelope,
          idempotencyResult,
          'workflow_admission_blocked',
          startResult.admission.reasonCode,
          startResult.admission.evidenceRefs,
        );
      }

      await this.options.idempotencyStore.commitDispatch(
        idempotencyResult.reservation_id,
        dispatchRef,
        evidenceRef,
      );

      return {
        outcome: 'accepted_dispatched',
        run_id: runId,
        dispatch_ref: dispatchRef,
        workflow_ref: envelope.workflow_ref ?? '',
        policy_ref:
          startResult.runState.admission.policyRef ?? `policy:${envelope.workflow_ref}`,
        evidence_ref: evidenceRef,
      };
    } catch (error) {
      return this.rejectAndRelease(
        envelope,
        idempotencyResult,
        'workflow_admission_blocked',
        'workflow_start_failed',
        [(error as Error).message],
      );
    }
  }
}
