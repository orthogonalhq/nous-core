import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeDefinitionId,
} from '@nous/shared';

export class ParallelJoinWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'parallel-join' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'parallel-join') {
      throw new Error(
        'ParallelJoinWorkflowNodeHandler received non parallel-join config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      `join_mode=${config.joinMode}`,
    ];

    // Enumerate upstream nodes via inbound edges
    const joinNodeId = context.nodeDefinition.id;
    const inboundEdgeIds =
      context.graph.nodes[joinNodeId]?.inboundEdgeIds ?? [];

    if (inboundEdgeIds.length === 0) {
      return {
        outcome: 'failed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: 'none',
        reasonCode: 'workflow_parallel_join_no_upstream',
        evidenceRefs: [...evidenceRefs, 'error=no_inbound_edges'],
      };
    }

    const upstreamNodeIds = inboundEdgeIds
      .map((edgeId) => context.graph.edges[edgeId]?.from)
      .filter((id): id is WorkflowNodeDefinitionId => Boolean(id));

    const totalUpstreamCount = upstreamNodeIds.length;

    // Count completed and resolved (completed or skipped) upstream nodes
    const completedUpstreamNodeIds = upstreamNodeIds.filter((nodeId) => {
      const status = context.runState.nodeStates[nodeId]?.status;
      return status === 'completed';
    });

    const resolvedUpstreamNodeIds = upstreamNodeIds.filter((nodeId) => {
      const status = context.runState.nodeStates[nodeId]?.status;
      return status === 'completed' || status === 'skipped';
    });

    const completedCount = completedUpstreamNodeIds.length;

    // Determine required count based on join mode
    let requiredCount: number;
    switch (config.joinMode) {
      case 'all':
        requiredCount = totalUpstreamCount;
        break;
      case 'any':
        requiredCount = 1;
        break;
      case 'n-of-m': {
        const configRequired = config.requiredCount;
        if (configRequired == null) {
          // Default to all when requiredCount is not specified
          requiredCount = totalUpstreamCount;
        } else if (configRequired > totalUpstreamCount) {
          return {
            outcome: 'failed',
            governanceDecision: context.governanceDecision,
            sideEffectStatus: 'none',
            reasonCode: 'workflow_parallel_join_invalid_required_count',
            evidenceRefs: [
              ...evidenceRefs,
              `error=required_count_${configRequired}_exceeds_upstream_count_${totalUpstreamCount}`,
            ],
          };
        } else {
          requiredCount = configRequired;
        }
        break;
      }
      default:
        requiredCount = totalUpstreamCount;
    }

    // For 'all' mode: also consider resolved (completed + skipped) as meeting condition
    // This handles race-mode splits where losers are skipped
    const allResolved = resolvedUpstreamNodeIds.length === totalUpstreamCount;
    const conditionMet = completedCount >= requiredCount || (config.joinMode === 'all' && allResolved);

    if (conditionMet) {
      return {
        outcome: 'completed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: 'none',
        outputRef: completedUpstreamNodeIds.join(','),
        reasonCode: 'workflow_parallel_join_completed',
        evidenceRefs: [
          ...evidenceRefs,
          `completed_count=${completedCount}`,
          `required_count=${requiredCount}`,
          `total_upstream=${totalUpstreamCount}`,
        ],
      };
    }

    // Not yet met — enter waiting state
    const waitEvidenceRefs = [
      ...evidenceRefs,
      `completed_count=${completedCount}`,
      `required_count=${requiredCount}`,
      `total_upstream=${totalUpstreamCount}`,
    ];

    return {
      outcome: 'waiting',
      governanceDecision: context.governanceDecision,
      waitState: {
        kind: 'parallel_join',
        reasonCode: 'workflow_parallel_join_waiting',
        evidenceRefs: waitEvidenceRefs,
        requestedAt: new Date().toISOString(),
        externalRef: config.timeoutMs != null ? `timeout_ms=${config.timeoutMs}` : undefined,
      },
      sideEffectStatus: 'none',
      reasonCode: 'workflow_parallel_join_waiting',
      evidenceRefs: waitEvidenceRefs,
    };
  }
}
