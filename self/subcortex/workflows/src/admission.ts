import {
  WorkmodeIdSchema,
  type WorkflowAdmissionRequest,
  type WorkflowAdmissionResult,
} from '@nous/shared';

const AUTHORITY_ORDER = {
  nous_cortex: 2,
  orchestration_agent: 1,
  worker_agent: 0,
} as const;

export function evaluateWorkflowAdmission(
  request: WorkflowAdmissionRequest,
): WorkflowAdmissionResult {
  const targetActor = request.targetActor ?? 'worker_agent';

  if (!WorkmodeIdSchema.safeParse(request.workmodeId).success) {
    return {
      allowed: false,
      reasonCode: 'WMODE-001',
      evidenceRefs: [`workmode_id=${request.workmodeId}`],
    };
  }

  if (request.sourceActor === 'worker_agent') {
    return {
      allowed: false,
      reasonCode: 'WMODE-010',
      evidenceRefs: [
        `worker cannot start workflow runs; source=${request.sourceActor} target=${targetActor}`,
      ],
    };
  }

  if (
    request.sourceActor === 'orchestration_agent' &&
    targetActor === 'orchestration_agent'
  ) {
    return {
      allowed: false,
      reasonCode: 'WMODE-003',
      evidenceRefs: ['nested orchestration forbidden'],
    };
  }

  if (AUTHORITY_ORDER[request.sourceActor] <= AUTHORITY_ORDER[targetActor]) {
    return {
      allowed: false,
      reasonCode: 'WMODE-002',
      evidenceRefs: [
        `authority widening blocked; source=${request.sourceActor} target=${targetActor}`,
      ],
    };
  }

  if (request.controlState == null) {
    return {
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED',
      evidenceRefs: ['control_state=undefined'],
    };
  }

  if (request.controlState === 'hard_stopped') {
    return {
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED',
      evidenceRefs: ['control_state=hard_stopped'],
    };
  }

  if (request.controlState === 'paused_review') {
    return {
      allowed: false,
      reasonCode: 'POL-PAUSED-BLOCKED',
      evidenceRefs: ['control_state=paused_review'],
    };
  }

  if (request.controlState === 'resuming') {
    return {
      allowed: false,
      reasonCode: 'OPCTL-INVALID-STATE',
      evidenceRefs: ['control_state=resuming'],
    };
  }

  return {
    allowed: true,
    reasonCode: 'workflow_admitted',
    evidenceRefs: [
      `project_id=${request.projectId}`,
      `workflow_definition_id=${request.workflowDefinitionId}`,
      `workmode_id=${request.workmodeId}`,
    ],
    policyRef: `workmode:${request.workmodeId}`,
  };
}
