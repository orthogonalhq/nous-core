import { randomUUID } from 'node:crypto';
import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class QualityGateWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'quality-gate' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'quality-gate') {
      throw new Error(
        'QualityGateWorkflowNodeHandler received non quality-gate config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
    ];
    const passed = context.payload?.qualityGatePassed ?? true;

    if (passed) {
      return {
        outcome: 'completed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
        outputRef:
          context.payload?.outputRef ??
          `quality-gate:${config.evaluatorRef}:pass`,
        reasonCode: 'workflow_quality_gate_passed',
        evidenceRefs,
      };
    }

    const correctionArc =
      config.failureAction === 'block'
        ? undefined
        : {
            id: randomUUID(),
            runId: context.runState.runId,
            nodeDefinitionId: context.nodeDefinition.id,
            type: config.failureAction,
            sourceAttempt:
              context.runState.nodeStates[context.nodeDefinition.id]?.attempts.length + 1,
            reasonCode: `workflow_quality_gate_${config.failureAction}_required`,
            evidenceRefs,
            occurredAt: new Date().toISOString(),
          };

    return {
      outcome: 'blocked',
      governanceDecision: context.governanceDecision,
      correctionArc,
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
      reasonCode:
        config.failureAction === 'block'
          ? 'workflow_quality_gate_blocked'
          : `workflow_quality_gate_${config.failureAction}_required`,
      evidenceRefs,
    };
  }
}
