import { randomUUID } from 'node:crypto';
import type {
  IToolExecutor,
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class ToolExecutionWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'tool-execution' as const;

  constructor(private readonly toolExecutor?: IToolExecutor) {}

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'tool-execution') {
      throw new Error(
        'ToolExecutionWorkflowNodeHandler received non tool-execution config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
    ];

    if (context.nodeDefinition.executionModel === 'async-batch') {
      return {
        outcome: 'waiting',
        governanceDecision: context.governanceDecision,
        waitState: {
          kind: 'async_batch',
          reasonCode: 'workflow_node_waiting_async_batch',
          evidenceRefs,
          requestedAt: new Date().toISOString(),
          resumeToken: randomUUID(),
          externalRef:
            context.payload?.externalRef ?? `tool:${config.toolName}:batch`,
        },
        sideEffectStatus: context.payload?.sideEffectStatus ?? 'idempotent',
        outputRef: context.payload?.outputRef,
        reasonCode: 'workflow_node_waiting_async_batch',
        evidenceRefs,
      };
    }

    if (!this.toolExecutor) {
      return {
        outcome: 'blocked',
        governanceDecision: context.governanceDecision,
        sideEffectStatus: context.payload?.sideEffectStatus ?? 'idempotent',
        reasonCode: 'workflow_tool_executor_unavailable',
        evidenceRefs,
      };
    }

    const toolResult = await this.toolExecutor.execute(
      config.toolName,
      buildToolParams(context, config.toolName),
      context.projectConfig.id,
    );

    if (!toolResult.success) {
      return {
        outcome: 'failed',
        governanceDecision: context.governanceDecision,
        sideEffectStatus:
          context.payload?.sideEffectStatus ?? 'unknown_external_effect',
        reasonCode: 'workflow_tool_execution_failed',
        evidenceRefs: [
          ...evidenceRefs,
          toolResult.error ?? 'tool_error=unknown',
        ],
      };
    }

    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'idempotent',
      outputRef:
        context.payload?.outputRef ?? `tool:${config.toolName}:completed`,
      reasonCode: 'workflow_tool_execution_completed',
      evidenceRefs,
    };
  }
}

function buildToolParams(
  context: WorkflowNodeExecutionContext,
  toolName: string,
): unknown {
  const params =
    context.payload?.toolParams != null
      ? context.payload.toolParams
      : { inputMappingRef: context.nodeDefinition.config.type === 'tool-execution'
          ? context.nodeDefinition.config.inputMappingRef
          : undefined };

  if (params == null || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }

  return {
    ...params,
    workflowRunId:
      'workflowRunId' in params ? (params as Record<string, unknown>).workflowRunId : context.runState.runId,
    dispatchLineageId:
      'dispatchLineageId' in params
        ? (params as Record<string, unknown>).dispatchLineageId
        : context.dispatchLineage.id,
    projectId:
      toolName === 'refresh_project_knowledge' &&
      !('projectId' in params)
        ? context.projectConfig.id
        : (params as Record<string, unknown>).projectId,
    trigger:
      toolName === 'refresh_project_knowledge' &&
      !('trigger' in params)
        ? 'workflow'
        : (params as Record<string, unknown>).trigger,
    requestedAt:
      toolName === 'refresh_project_knowledge' &&
      !('requestedAt' in params)
        ? new Date().toISOString()
        : (params as Record<string, unknown>).requestedAt,
    reasonCode:
      toolName === 'refresh_project_knowledge' &&
      !('reasonCode' in params)
        ? 'workflow_tool_refresh'
        : (params as Record<string, unknown>).reasonCode,
  };
}
