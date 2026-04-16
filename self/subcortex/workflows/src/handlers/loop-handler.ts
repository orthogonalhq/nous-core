import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class LoopWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'loop' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'loop') {
      throw new Error(
        'LoopWorkflowNodeHandler received non loop config',
      );
    }

    const nodeId = context.nodeDefinition.id;
    const iterationCount =
      (context.runState.nodeStates[nodeId]?.attempts.length ?? 0) + 1;
    const maxIterations = config.maxIterations;

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      `iteration=${iterationCount}`,
      `max_iterations=${maxIterations}`,
    ];

    // Safety invariant: check maxIterations BEFORE evaluating exit condition
    if (iterationCount > maxIterations) {
      return {
        outcome: 'completed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: 'none',
        selectedBranchKey: 'exit',
        reasonCode: 'workflow_loop_max_iterations',
        evidenceRefs,
      };
    }

    // Evaluate exit condition via payload (same mechanism as condition handler)
    const exitConditionMet = context.payload?.conditionResult === true;

    if (exitConditionMet) {
      return {
        outcome: 'completed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: 'none',
        selectedBranchKey: 'exit',
        reasonCode: 'workflow_loop_exit_condition_met',
        evidenceRefs,
      };
    }

    // Continue looping — check if backoff is configured
    const backoffMs = (config as { backoffMs?: number }).backoffMs;
    if (backoffMs != null && backoffMs > 0) {
      return {
        outcome: 'waiting',
        governanceDecision: context.governanceDecision,
        waitState: {
          kind: 'loop_backoff',
          reasonCode: 'workflow_loop_backoff',
          evidenceRefs,
          requestedAt: new Date().toISOString(),
          externalRef: `backoff_ms=${backoffMs}`,
        },
        sideEffectStatus: 'none',
        selectedBranchKey: 'loop',
        reasonCode: 'workflow_loop_backoff',
        evidenceRefs,
      };
    }

    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: 'none',
      selectedBranchKey: 'loop',
      reasonCode: 'workflow_loop_continue',
      evidenceRefs,
    };
  }
}
