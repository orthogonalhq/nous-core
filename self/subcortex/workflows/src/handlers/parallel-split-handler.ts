import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class ParallelSplitWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'parallel-split' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'parallel-split') {
      throw new Error(
        'ParallelSplitWorkflowNodeHandler received non parallel-split config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      `split_mode=${config.splitMode}`,
    ];

    // Check that the split node has outbound edges
    const outboundEdgeIds =
      context.graph.nodes[context.nodeDefinition.id]?.outboundEdgeIds ?? [];
    if (outboundEdgeIds.length === 0) {
      return {
        outcome: 'failed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: 'none',
        reasonCode: 'workflow_parallel_split_no_branches',
        evidenceRefs: [...evidenceRefs, 'error=no_outbound_edges'],
      };
    }

    // The split handler completes immediately. The traversal layer activates
    // all outbound branches because selectedBranchKey is undefined and the
    // node type is 'parallel-split'.
    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: 'none',
      selectedBranchKey: undefined,
      reasonCode: 'workflow_parallel_split_activated',
      evidenceRefs,
    };
  }
}
