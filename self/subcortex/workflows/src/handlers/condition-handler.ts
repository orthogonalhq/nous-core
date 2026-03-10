import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class ConditionWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'condition' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'condition') {
      throw new Error('ConditionWorkflowNodeHandler received non condition config');
    }

    const passes =
      context.payload?.conditionResult ??
      (context.payload?.selectedBranchKey
        ? context.payload.selectedBranchKey === config.trueBranchKey
        : true);
    const selectedBranchKey = passes
      ? config.trueBranchKey
      : config.falseBranchKey;

    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
      selectedBranchKey,
      reasonCode: 'workflow_condition_evaluated',
      evidenceRefs: [
        ...context.dispatchLineage.evidenceRefs,
        `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
        `selected_branch_key=${selectedBranchKey}`,
      ],
    };
  }
}
