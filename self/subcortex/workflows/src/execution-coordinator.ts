import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  CriticalActionCategory,
  DerivedWorkflowGraph,
  IPfcEngine,
  IModelRouter,
  IToolExecutor,
  IWorkflowNodeHandler,
  ProjectConfig,
  WorkflowDispatchLineage,
  WorkflowNodeDefinition,
  WorkflowNodeExecutionContext,
  WorkflowNodeExecutionPayload,
  WorkflowNodeExecutionResult,
  WorkflowNodeKind,
  WorkflowRunState,
} from '@nous/shared';
import { ConfidenceGovernanceEvaluationResultSchema } from '@nous/shared';
import { createWorkflowNodeHandlerRegistry } from './handlers/index.js';

export interface WorkflowRuntimeObserver {
  event(
    name: string,
    fields: Record<string, unknown>,
  ): void | Promise<void>;
}

export interface WorkflowExecutionCoordinatorDependencies {
  pfcEngine: IPfcEngine;
  modelRouter?: IModelRouter;
  toolExecutor?: IToolExecutor;
  observer?: WorkflowRuntimeObserver;
  /** Override or extend the built-in node handler registry (e.g. coding agent handlers). */
  nodeHandlerOverrides?: Map<WorkflowNodeKind, IWorkflowNodeHandler>;
}

export interface ExecuteWorkflowNodeInput {
  projectConfig: ProjectConfig;
  graph: DerivedWorkflowGraph;
  runState: WorkflowRunState;
  nodeDefinition: WorkflowNodeDefinition;
  dispatchLineage: WorkflowDispatchLineage;
  controlState: WorkflowNodeExecutionContext['controlState'];
  governanceInput?: ConfidenceGovernanceEvaluationInput;
  payload?: WorkflowNodeExecutionPayload;
}

const DEFAULT_PATTERN_ID = '550e8400-e29b-41d4-a716-446655440801';
const DEFAULT_EVENT_ID = '550e8400-e29b-41d4-a716-446655440802';

const actionCategoryByNodeType: Record<string, CriticalActionCategory> = {
  'model-call': 'model-invoke',
  'tool-execution': 'tool-execute',
  condition: 'trace-persist',
  transform: 'trace-persist',
  'quality-gate': 'trace-persist',
  'human-decision': 'opctl-command',
  subworkflow: 'trace-persist',
};

function buildDefaultGovernanceInput(
  nodeDefinition: WorkflowNodeDefinition,
  controlState: WorkflowNodeExecutionContext['controlState'],
): ConfidenceGovernanceEvaluationInput {
  const actionCategory =
    actionCategoryByNodeType[nodeDefinition.type] ?? 'trace-persist';

  return {
    governance: nodeDefinition.governance,
    actionCategory,
    projectControlState: controlState,
    pattern: {
      id: DEFAULT_PATTERN_ID as ConfidenceGovernanceEvaluationInput['pattern']['id'],
      content: `workflow node ${nodeDefinition.id}`,
      confidence: 0.95,
      basedOn: [],
      supersedes: [],
      evidenceRefs: [
        {
          actionCategory,
          authorizationEventId:
            DEFAULT_EVENT_ID as ConfidenceGovernanceEvaluationInput['pattern']['evidenceRefs'][number]['authorizationEventId'],
        },
      ],
      scope: 'project',
      tags: ['workflow-runtime'],
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
    },
    confidenceSignal: {
      tier: 'high',
      confidence: 0.95,
      supportingSignals: 16,
      patternId:
        DEFAULT_PATTERN_ID as ConfidenceGovernanceEvaluationInput['confidenceSignal']['patternId'],
      entryId:
        DEFAULT_PATTERN_ID as ConfidenceGovernanceEvaluationInput['confidenceSignal']['entryId'],
      decayState: 'stable',
    },
    explanation: {
      patternId:
        DEFAULT_PATTERN_ID as ConfidenceGovernanceEvaluationInput['explanation']['patternId'],
      outcomeRef: `workflow:${nodeDefinition.id}`,
      evidenceRefs: [
        {
          actionCategory,
          authorizationEventId:
            DEFAULT_EVENT_ID as ConfidenceGovernanceEvaluationInput['explanation']['evidenceRefs'][number]['authorizationEventId'],
        },
      ],
    },
  };
}

function stringifiedEvidenceRefs(
  decision: ConfidenceGovernanceEvaluationResult,
  fallback: string[],
): string[] {
  return decision.evidenceRefs.length > 0
    ? decision.evidenceRefs.map((ref) => JSON.stringify(ref))
    : fallback;
}

function buildGovernanceOnlyResult(
  decision: ConfidenceGovernanceEvaluationResult,
  nodeDefinition: WorkflowNodeDefinition,
  dispatchLineage: WorkflowDispatchLineage,
): WorkflowNodeExecutionResult {
  const evidenceRefs = stringifiedEvidenceRefs(decision, [
    ...dispatchLineage.evidenceRefs,
    `workflow_dispatch_lineage_id=${dispatchLineage.id}`,
  ]);

  if (decision.outcome === 'deny') {
    return {
      outcome: 'blocked',
      governanceDecision: decision,
      sideEffectStatus: 'none',
      reasonCode: decision.reasonCode,
      evidenceRefs,
    };
  }

  if (decision.outcome === 'defer' || decision.outcome === 'escalate') {
    return {
      outcome: 'waiting',
      governanceDecision: decision,
      waitState: {
        kind:
          nodeDefinition.type === 'human-decision' || decision.requiresConfirmation
            ? 'human_decision'
            : 'retry_backoff',
        reasonCode: decision.reasonCode,
        evidenceRefs,
        requestedAt: new Date().toISOString(),
      },
      sideEffectStatus: 'none',
      reasonCode: decision.reasonCode,
      evidenceRefs,
    };
  }

  return {
    outcome: 'completed',
    governanceDecision: decision,
    sideEffectStatus: 'none',
    reasonCode: decision.reasonCode,
    evidenceRefs,
  };
}

export async function executeWorkflowNode(
  deps: WorkflowExecutionCoordinatorDependencies,
  input: ExecuteWorkflowNodeInput,
): Promise<WorkflowNodeExecutionResult> {
  const governanceInput =
    input.governanceInput ??
    buildDefaultGovernanceInput(input.nodeDefinition, input.controlState);
  const governanceDecision = ConfidenceGovernanceEvaluationResultSchema.parse(
    await deps.pfcEngine.evaluateConfidenceGovernance(governanceInput),
  );

  await deps.observer?.event('workflow_node_governance_evaluated', {
    runId: input.runState.runId,
    nodeDefinitionId: input.nodeDefinition.id,
    outcome: governanceDecision.outcome,
    reasonCode: governanceDecision.reasonCode,
    controlState: input.controlState,
  });

  if (
    governanceDecision.outcome === 'deny' ||
    governanceDecision.outcome === 'defer' ||
    governanceDecision.outcome === 'escalate'
  ) {
    return buildGovernanceOnlyResult(
      governanceDecision,
      input.nodeDefinition,
      input.dispatchLineage,
    );
  }

  const handlerRegistry = createWorkflowNodeHandlerRegistry({
    modelRouter: deps.modelRouter,
    toolExecutor: deps.toolExecutor,
  });
  if (deps.nodeHandlerOverrides) {
    for (const [kind, override] of deps.nodeHandlerOverrides) {
      handlerRegistry.set(kind, override);
    }
  }
  const handler = handlerRegistry.get(input.nodeDefinition.type);
  if (!handler) {
    return {
      outcome: 'blocked',
      governanceDecision,
      sideEffectStatus: 'none',
      reasonCode: 'workflow_handler_unavailable',
      evidenceRefs: [
        ...input.dispatchLineage.evidenceRefs,
        `workflow_dispatch_lineage_id=${input.dispatchLineage.id}`,
      ],
    };
  }

  return handler.execute({
    projectConfig: input.projectConfig,
    graph: input.graph,
    runState: input.runState,
    nodeDefinition: input.nodeDefinition,
    dispatchLineage: input.dispatchLineage,
    controlState: input.controlState,
    governanceInput,
    governanceDecision,
    payload: input.payload,
  });
}
