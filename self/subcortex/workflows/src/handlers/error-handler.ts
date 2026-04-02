import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeDefinitionId,
} from '@nous/shared';

export class ErrorHandlerWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'error-handler' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'error-handler') {
      throw new Error(
        'ErrorHandlerWorkflowNodeHandler received non error-handler config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
      `catch_scope=${config.catchScope}`,
    ];

    const terminalStatuses = new Set(['completed', 'failed', 'skipped']);

    if (config.catchScope === 'specific') {
      const targetNodeIds = config.targetNodeIds ?? [];

      // Validate that all target node IDs exist in the graph
      const invalidTargetIds = targetNodeIds.filter(
        (id) => !context.graph.nodes[id as WorkflowNodeDefinitionId],
      );
      if (invalidTargetIds.length > 0) {
        return {
          outcome: 'failed',
          governanceDecision: context.governanceDecision,
          sideEffectStatus: 'none',
          reasonCode: 'workflow_error_handler_invalid_target',
          evidenceRefs: [
            ...evidenceRefs,
            ...invalidTargetIds.map((id) => `invalid_target_node_id=${id}`),
          ],
        };
      }

      // Check specific target nodes for failure
      const failedNodeIds = targetNodeIds.filter((id) => {
        const nodeState = context.runState.nodeStates[id as WorkflowNodeDefinitionId];
        return nodeState && terminalStatuses.has(nodeState.status) && nodeState.status === 'failed';
      });

      if (failedNodeIds.length > 0) {
        return {
          outcome: 'completed',
          governanceDecision: context.governanceDecision,
          sideEffectStatus: 'none',
          selectedBranchKey: 'error',
          outputRef: failedNodeIds.join(','),
          reasonCode: 'workflow_error_handler_caught',
          evidenceRefs: [
            ...evidenceRefs,
            ...failedNodeIds.map((id) => `failed_node_id=${id}`),
          ],
        };
      }
    } else {
      // catchScope: 'upstream' — check all inbound-edge source nodes
      const errorHandlerNodeId = context.nodeDefinition.id;
      const inboundEdgeIds =
        context.graph.nodes[errorHandlerNodeId]?.inboundEdgeIds ?? [];

      const upstreamNodeIds = inboundEdgeIds
        .map((edgeId) => context.graph.edges[edgeId]?.from)
        .filter((id): id is WorkflowNodeDefinitionId => Boolean(id));

      const failedNodeIds = upstreamNodeIds.filter((id) => {
        const nodeState = context.runState.nodeStates[id];
        return nodeState && terminalStatuses.has(nodeState.status) && nodeState.status === 'failed';
      });

      if (failedNodeIds.length > 0) {
        return {
          outcome: 'completed',
          governanceDecision: context.governanceDecision,
          sideEffectStatus: 'none',
          selectedBranchKey: 'error',
          outputRef: failedNodeIds.join(','),
          reasonCode: 'workflow_error_handler_caught',
          evidenceRefs: [
            ...evidenceRefs,
            ...failedNodeIds.map((id) => `failed_node_id=${id}`),
          ],
        };
      }
    }

    // No failures detected — passthrough
    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: 'none',
      selectedBranchKey: undefined,
      reasonCode: 'workflow_error_handler_passthrough',
      evidenceRefs,
    };
  }
}
