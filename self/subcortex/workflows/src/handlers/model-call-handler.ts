import { randomUUID } from 'node:crypto';
import type {
  IModelRouter,
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class ModelCallWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'model-call' as const;

  constructor(private readonly modelRouter?: IModelRouter) {}

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'model-call') {
      throw new Error('ModelCallWorkflowNodeHandler received non model-call config');
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
            context.payload?.externalRef ??
            `model:${config.modelRole}:${config.promptRef}`,
        },
        sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
        outputRef: context.payload?.outputRef,
        reasonCode: 'workflow_node_waiting_async_batch',
        evidenceRefs,
      };
    }

    const providerId = this.modelRouter
      ? await this.modelRouter.route(config.modelRole, context.projectConfig.id)
      : undefined;

    return {
      outcome: 'completed',
      governanceDecision: context.governanceDecision,
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
      outputRef:
        context.payload?.outputRef ??
        `model:${providerId ?? 'unrouted'}:${config.promptRef}`,
      reasonCode: 'workflow_model_call_completed',
      evidenceRefs,
    };
  }
}
