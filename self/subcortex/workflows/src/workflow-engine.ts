import { randomUUID } from 'node:crypto';
import { resolveInstalledWorkflowDefinition } from '@nous/subcortex-projects';
import type {
  DerivedWorkflowGraph,
  ICheckpointManager,
  IModelRouter,
  IRuntime,
  IToolExecutor,
  IWorkflowEngine,
  IPfcEngine,
  ProjectConfig,
  ProjectWorkflowPackageBinding,
  ResolvedWorkflowDefinitionSource,
  WorkflowAdmissionRequest,
  WorkflowAdmissionResult,
  WorkflowContinueNodeRequest,
  WorkflowContinueNodeRequest as WorkflowContinueNodeRequestType,
  WorkflowExecutionId,
  WorkflowExecuteNodeRequest,
  WorkflowNodeDefinition,
  WorkflowNodeDefinitionId,
  WorkflowNodeExecutionResult,
  WorkflowRunState,
  WorkflowStartRequest,
  WorkflowStartResult,
  WorkflowTransitionInput,
  WorkflowDefinition,
} from '@nous/shared';
import {
  WorkflowContinueNodeRequestSchema,
  WorkflowExecuteNodeRequestSchema,
} from '@nous/shared';
import { buildDerivedWorkflowGraph } from './graph-builder.js';
import { evaluateWorkflowAdmission } from './admission.js';
import {
  captureWorkflowCheckpoint,
  commitWorkflowCheckpoint,
  type WorkflowCheckpointRuntimeDependencies,
} from './checkpoint-runtime.js';
import {
  executeWorkflowNode,
  type WorkflowExecutionCoordinatorDependencies,
  type WorkflowRuntimeObserver,
} from './execution-coordinator.js';
import { resolveWorkflowContinuation } from './continuations.js';
import {
  completeWorkflowNodeInRunState,
  createInitialWorkflowRunState,
  pauseWorkflowRunState,
  recordWorkflowNodeExecution,
  resolveWorkflowNodeContinuation,
  resumeWorkflowRunState,
} from './run-state.js';

const clone = <T>(value: T): T => structuredClone(value);

export interface WorkflowEngineDependencies {
  pfcEngine?: IPfcEngine;
  modelRouter?: IModelRouter;
  toolExecutor?: IToolExecutor;
  checkpointManager?: ICheckpointManager;
  observer?: WorkflowRuntimeObserver;
  runtime?: IRuntime;
  instanceRoot?: string;
}

function findNodeDefinition(
  graph: DerivedWorkflowGraph,
  nodeDefinitionId: WorkflowNodeDefinitionId,
): WorkflowNodeDefinition {
  const definition = graph.nodes[nodeDefinitionId]?.definition;
  if (!definition) {
    throw new Error(`Unknown workflow node definition id: ${nodeDefinitionId}`);
  }
  return definition;
}

function buildCheckpointPendingResult(
  result: WorkflowNodeExecutionResult,
  checkpointId: string | undefined,
): WorkflowNodeExecutionResult {
  return {
    ...result,
    outcome: 'waiting',
    waitState: {
      kind: 'checkpoint_commit',
      reasonCode: 'workflow_checkpoint_commit_pending',
      evidenceRefs:
        result.evidenceRefs.length > 0
          ? result.evidenceRefs
          : ['workflow_checkpoint_commit_pending'],
      requestedAt: new Date().toISOString(),
      resumeToken: randomUUID(),
      externalRef: checkpointId,
    },
    checkpointId,
    reasonCode: 'workflow_checkpoint_commit_pending',
  };
}

export class DeterministicWorkflowEngine implements IWorkflowEngine {
  private readonly graphs = new Map<WorkflowExecutionId, DerivedWorkflowGraph>();

  private readonly states = new Map<WorkflowExecutionId, WorkflowRunState>();

  private readonly projectConfigs = new Map<WorkflowExecutionId, ProjectConfig>();

  constructor(private readonly deps: WorkflowEngineDependencies = {}) {}

  private async resolveInstalledBindingSelection(input: {
    projectConfig: ProjectConfig;
    binding: ProjectWorkflowPackageBinding;
  }): Promise<{
    definition: WorkflowDefinition;
    source: ResolvedWorkflowDefinitionSource;
  }> {
    if (!this.deps.runtime) {
      throw new Error(
        'workflow installed definition resolution requires runtime access',
      );
    }

    return resolveInstalledWorkflowDefinition({
      instanceRoot: this.deps.instanceRoot ?? process.cwd(),
      runtime: this.deps.runtime,
      projectConfig: input.projectConfig,
      binding: input.binding,
    });
  }

  private async resolveDefinitionSelection(
    projectConfig: WorkflowStartRequest['projectConfig'],
    workflowDefinitionId?: WorkflowStartRequest['workflowDefinitionId'],
  ): Promise<{
    definition: WorkflowDefinition;
    source: ResolvedWorkflowDefinitionSource;
  }> {
    const workflowConfig = projectConfig.workflow;
    const inlineDefinitions = workflowConfig?.definitions ?? [];
    const packageBindings = workflowConfig?.packageBindings ?? [];

    if (!workflowConfig || (inlineDefinitions.length === 0 && packageBindings.length === 0)) {
      throw new Error('workflow definition not configured for project');
    }

    const resolveInlineDefinition = (
      definition: WorkflowDefinition,
    ) => ({
      definition,
      source: {
        workflowDefinitionId: definition.id,
        sourceKind: 'project_inline' as const,
      },
    });

    const resolveRequestedBinding = async (
      binding: ProjectWorkflowPackageBinding,
    ) => this.resolveInstalledBindingSelection({
      projectConfig,
      binding,
    });

    if (workflowDefinitionId) {
      const requestedInline = inlineDefinitions.find(
        (definition) => definition.id === workflowDefinitionId,
      );
      if (requestedInline) {
        return resolveInlineDefinition(requestedInline);
      }

      const requestedBinding = packageBindings.find(
        (binding) => binding.workflowDefinitionId === workflowDefinitionId,
      );
      if (requestedBinding) {
        return resolveRequestedBinding(requestedBinding);
      }

      throw new Error(
        `workflow definition ${workflowDefinitionId} not found in project config`,
      );
    }

    if (workflowConfig.defaultWorkflowDefinitionId) {
      const defaultInline = inlineDefinitions.find(
        (definition) =>
          definition.id === workflowConfig.defaultWorkflowDefinitionId,
      );
      if (defaultInline) {
        return resolveInlineDefinition(defaultInline);
      }

      const defaultBinding = packageBindings.find(
        (binding) =>
          binding.workflowDefinitionId === workflowConfig.defaultWorkflowDefinitionId,
      );
      if (defaultBinding) {
        return resolveRequestedBinding(defaultBinding);
      }

      throw new Error(
        `default workflow definition ${workflowConfig.defaultWorkflowDefinitionId} not found`,
      );
    }

    if (inlineDefinitions.length === 1 && packageBindings.length === 0) {
      return resolveInlineDefinition(inlineDefinitions[0]!);
    }

    if (packageBindings.length === 1 && inlineDefinitions.length === 0) {
      return resolveRequestedBinding(packageBindings[0]!);
    }

    throw new Error(
      'multiple workflow definitions configured without defaultWorkflowDefinitionId',
    );
  }

  async resolveDefinition(
    projectConfig: WorkflowStartRequest['projectConfig'],
    workflowDefinitionId?: WorkflowStartRequest['workflowDefinitionId'],
  ): Promise<WorkflowDefinition> {
    const selection = await this.resolveDefinitionSelection(
      projectConfig,
      workflowDefinitionId,
    );
    return selection.definition;
  }

  async resolveDefinitionSource(
    projectConfig: WorkflowStartRequest['projectConfig'],
    workflowDefinitionId?: WorkflowStartRequest['workflowDefinitionId'],
  ): Promise<ResolvedWorkflowDefinitionSource | null> {
    const selection = await this.resolveDefinitionSelection(
      projectConfig,
      workflowDefinitionId,
    );
    return selection.source;
  }

  async deriveGraph(definition: WorkflowDefinition): Promise<DerivedWorkflowGraph> {
    return buildDerivedWorkflowGraph(definition);
  }

  async evaluateAdmission(
    request: WorkflowAdmissionRequest,
  ): Promise<WorkflowAdmissionResult> {
    return evaluateWorkflowAdmission(request);
  }

  async start(request: WorkflowStartRequest): Promise<WorkflowStartResult> {
    let definition: WorkflowDefinition;
    try {
      definition = await this.resolveDefinition(
        request.projectConfig,
        request.workflowDefinitionId,
      );
    } catch (error) {
      return {
        status: 'admission_blocked',
        admission: {
          allowed: false,
          reasonCode: 'workflow_definition_unavailable',
          evidenceRefs: [(error as Error).message],
        },
      };
    }

    if (definition.projectId !== request.projectConfig.id) {
      return {
        status: 'admission_blocked',
        admission: {
          allowed: false,
          reasonCode: 'AUTH-SCOPE-MISMATCH',
          evidenceRefs: [
            `project_id=${request.projectConfig.id}`,
            `definition_project_id=${definition.projectId}`,
          ],
        },
      };
    }

    let graph: DerivedWorkflowGraph;
    try {
      graph = await this.deriveGraph(definition);
    } catch (error) {
      return {
        status: 'admission_blocked',
        admission: {
          allowed: false,
          reasonCode: 'workflow_definition_invalid',
          evidenceRefs: [(error as Error).message],
        },
      };
    }

    const admission = await this.evaluateAdmission({
      projectId: request.projectConfig.id,
      workflowDefinitionId: definition.id,
      workmodeId: request.workmodeId,
      sourceActor: request.sourceActor,
      targetActor: request.targetActor ?? 'worker_agent',
      controlState: request.controlState,
    });
    if (!admission.allowed) {
      return { status: 'admission_blocked', admission };
    }

    const runId = request.runId ?? (randomUUID() as WorkflowExecutionId);
    const runState = createInitialWorkflowRunState({
      runId,
      graph,
      admission,
      triggerContext: request.triggerContext,
      transition: {
        reasonCode: 'workflow_started',
        evidenceRefs:
          request.admissionEvidenceRefs ?? [`workflow_definition_id=${definition.id}`],
      },
      startedAt: request.startedAt,
    });

    this.graphs.set(runId, graph);
    this.states.set(runId, runState);
    this.projectConfigs.set(runId, clone(request.projectConfig));

    return {
      status: 'started',
      graph: clone(graph),
      runState: clone(runState),
    };
  }

  async resume(
    executionId: WorkflowExecutionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    const state = this.states.get(executionId);
    if (!state) {
      throw new Error(`Unknown workflow run id: ${executionId}`);
    }
    const nextState = resumeWorkflowRunState(state, transition);
    this.states.set(executionId, nextState);
    return clone(nextState);
  }

  async pause(
    executionId: WorkflowExecutionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    const state = this.states.get(executionId);
    if (!state) {
      throw new Error(`Unknown workflow run id: ${executionId}`);
    }
    const nextState = pauseWorkflowRunState(state, transition);
    this.states.set(executionId, nextState);
    return clone(nextState);
  }

  async completeNode(
    executionId: WorkflowExecutionId,
    nodeDefinitionId: WorkflowNodeDefinitionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    const state = this.states.get(executionId);
    const graph = this.graphs.get(executionId);
    if (!state || !graph) {
      throw new Error(`Unknown workflow run id: ${executionId}`);
    }
    const nextState = completeWorkflowNodeInRunState(
      state,
      graph,
      nodeDefinitionId,
      transition,
    );
    this.states.set(executionId, nextState);
    return clone(nextState);
  }

  async executeReadyNode(
    request: WorkflowExecuteNodeRequest,
  ): Promise<WorkflowRunState> {
    const parsed = WorkflowExecuteNodeRequestSchema.parse(request);
    const state = this.states.get(parsed.executionId);
    const graph = this.graphs.get(parsed.executionId);
    const projectConfig = this.projectConfigs.get(parsed.executionId);
    if (!state || !graph || !projectConfig) {
      throw new Error(`Unknown workflow run id: ${parsed.executionId}`);
    }
    if (!this.deps.pfcEngine) {
      throw new Error('DeterministicWorkflowEngine requires pfcEngine for executeReadyNode');
    }

    const nodeState = state.nodeStates[parsed.nodeDefinitionId];
    if (!nodeState) {
      throw new Error(`Unknown workflow node definition id: ${parsed.nodeDefinitionId}`);
    }
    const dispatchLineage = state.dispatchLineage.find(
      (lineage) => lineage.id === nodeState.lastDispatchLineageId,
    );
    if (!dispatchLineage) {
      throw new Error(
        `Workflow node ${parsed.nodeDefinitionId} is missing dispatch lineage`,
      );
    }

    const result = await executeWorkflowNode(
      {
        pfcEngine: this.deps.pfcEngine,
        modelRouter: this.deps.modelRouter,
        toolExecutor: this.deps.toolExecutor,
        observer: this.deps.observer,
      } satisfies WorkflowExecutionCoordinatorDependencies,
      {
        projectConfig,
        graph,
        runState: state,
        nodeDefinition: findNodeDefinition(graph, parsed.nodeDefinitionId),
        dispatchLineage,
        controlState: parsed.controlState,
        governanceInput: parsed.governanceInput,
        payload: parsed.payload,
      },
    );

    const checkpointCapture = await captureWorkflowCheckpoint(
      {
        checkpointManager: this.deps.checkpointManager,
      } satisfies WorkflowCheckpointRuntimeDependencies,
      {
        runState: state,
        nodeDefinitionId: parsed.nodeDefinitionId,
        sideEffectStatus: result.sideEffectStatus,
        commitMode: parsed.payload?.checkpointCommitMode,
      },
    );

    const finalResult =
      result.outcome === 'completed' &&
      checkpointCapture.checkpointState === 'commit_pending'
        ? buildCheckpointPendingResult(result, checkpointCapture.checkpointId)
        : {
            ...result,
            checkpointId: checkpointCapture.checkpointId ?? result.checkpointId,
          };

    const nextState = recordWorkflowNodeExecution({
      state,
      graph,
      nodeDefinitionId: parsed.nodeDefinitionId,
      result: finalResult,
      transition: parsed.transition,
      checkpointState: checkpointCapture.checkpointState,
      lastPreparedCheckpointId: checkpointCapture.lastPreparedCheckpointId,
      lastCommittedCheckpointId: checkpointCapture.lastCommittedCheckpointId,
    });

    this.states.set(parsed.executionId, nextState);
    return clone(nextState);
  }

  async continueNode(
    request: WorkflowContinueNodeRequest,
  ): Promise<WorkflowRunState> {
    const parsed = WorkflowContinueNodeRequestSchema.parse(
      request,
    ) as WorkflowContinueNodeRequestType;
    const state = this.states.get(parsed.executionId);
    const graph = this.graphs.get(parsed.executionId);
    if (!state || !graph) {
      throw new Error(`Unknown workflow run id: ${parsed.executionId}`);
    }

    const nodeState = state.nodeStates[parsed.nodeDefinitionId];
    if (!nodeState) {
      throw new Error(`Unknown workflow node definition id: ${parsed.nodeDefinitionId}`);
    }

    const activeAttempt = nodeState.activeAttempt == null
      ? undefined
      : nodeState.attempts.find(
          (attempt) => attempt.attempt === nodeState.activeAttempt,
        );
    if (!activeAttempt) {
      throw new Error(
        `Workflow node ${parsed.nodeDefinitionId} has no active attempt`,
      );
    }

    const checkpointCommit =
      nodeState.activeWaitState?.kind === 'checkpoint_commit' ||
      state.checkpointState === 'commit_pending'
        ? await commitWorkflowCheckpoint(
            {
              checkpointManager: this.deps.checkpointManager,
            } satisfies WorkflowCheckpointRuntimeDependencies,
            {
              runState: state,
              checkpointId: parsed.checkpointId ?? activeAttempt.checkpointId,
              witnessRef: parsed.witnessRef,
            },
          )
        : undefined;

    const finalResult =
      checkpointCommit &&
      nodeState.activeWaitState?.kind === 'checkpoint_commit' &&
      !checkpointCommit.committed
        ? buildCheckpointPendingResult(
            {
              outcome: 'waiting',
              governanceDecision: activeAttempt.governanceDecision,
              waitState: nodeState.activeWaitState,
              sideEffectStatus: activeAttempt.sideEffectStatus,
              checkpointId: activeAttempt.checkpointId,
              outputRef: activeAttempt.outputRef,
              selectedBranchKey: activeAttempt.selectedBranchKey,
              reasonCode: 'workflow_checkpoint_commit_pending',
              evidenceRefs:
                parsed.transition.evidenceRefs.length > 0
                  ? parsed.transition.evidenceRefs
                  : ['workflow_checkpoint_commit_pending'],
            },
            checkpointCommit.checkpointId,
          )
        : resolveWorkflowContinuation({
            runState: state,
            nodeDefinition: findNodeDefinition(graph, parsed.nodeDefinitionId),
            nodeState,
            activeAttempt,
            request: {
              ...parsed,
              checkpointId: checkpointCommit?.checkpointId ?? parsed.checkpointId,
            },
          });

    const nextState = resolveWorkflowNodeContinuation({
      state,
      graph,
      nodeDefinitionId: parsed.nodeDefinitionId,
      result: {
        ...finalResult,
        checkpointId: checkpointCommit?.checkpointId ?? finalResult.checkpointId,
      },
      transition: parsed.transition,
      checkpointState: checkpointCommit?.checkpointState,
      lastPreparedCheckpointId: checkpointCommit?.lastPreparedCheckpointId,
      lastCommittedCheckpointId: checkpointCommit?.lastCommittedCheckpointId,
    });

    this.states.set(parsed.executionId, nextState);
    return clone(nextState);
  }

  async getState(
    executionId: WorkflowExecutionId,
  ): Promise<WorkflowRunState | null> {
    const state = this.states.get(executionId);
    return state ? clone(state) : null;
  }

  async listProjectRuns(projectId: ProjectConfig['id']): Promise<WorkflowRunState[]> {
    return [...this.states.values()]
      .filter((state) => state.projectId === projectId)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.startedAt.localeCompare(left.startedAt) ||
          right.runId.localeCompare(left.runId),
      )
      .map((state) => clone(state));
  }

  async getRunGraph(
    executionId: WorkflowExecutionId,
  ): Promise<DerivedWorkflowGraph | null> {
    const graph = this.graphs.get(executionId);
    return graph ? clone(graph) : null;
  }
}
