import { randomUUID } from 'node:crypto';
import type {
  IWorkflowNodeHandler,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionResult,
} from '@nous/shared';

export class HumanDecisionWorkflowNodeHandler implements IWorkflowNodeHandler {
  readonly nodeType = 'human-decision' as const;

  async execute(
    context: WorkflowNodeExecutionContext,
  ): Promise<WorkflowNodeExecutionResult> {
    const config = context.nodeDefinition.config;
    if (config.type !== 'human-decision') {
      throw new Error(
        'HumanDecisionWorkflowNodeHandler received non human-decision config',
      );
    }

    const evidenceRefs = [
      ...context.dispatchLineage.evidenceRefs,
      `workflow_dispatch_lineage_id=${context.dispatchLineage.id}`,
    ];

    return {
      outcome: 'waiting',
      governanceDecision: context.governanceDecision,
      waitState: {
        kind: 'human_decision',
        reasonCode: 'workflow_human_decision_required',
        evidenceRefs,
        requestedAt: new Date().toISOString(),
        resumeToken: randomUUID(),
        externalRef: config.decisionRef,
      },
      sideEffectStatus: context.payload?.sideEffectStatus ?? 'none',
      reasonCode: 'workflow_human_decision_required',
      evidenceRefs,
    };
  }
}
