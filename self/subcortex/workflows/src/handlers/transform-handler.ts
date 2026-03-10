import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class TransformWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'transform' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'transform') {
      throw new Error('TransformWorkflowNodeHandler received non transform config');
    }

    const outputRef =
      context.payload?.outputRef ??
      `transform:${config.transformRef}:${config.inputMappingRef}`;

    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
      outputRef,
      reasonCode: 'workflow_transform_completed',
      evidenceRefs: [
        ...context.dispatchLineage.evidenceRefs,
        `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      ],
    };
  }
}
