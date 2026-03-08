import { randomUUID } from 'node:crypto';
import type {
  DerivedWorkflowGraph,
  IWorkflowEngine,
  WorkflowAdmissionRequest,
  WorkflowAdmissionResult,
  WorkflowDefinition,
  WorkflowExecutionId,
  WorkflowNodeDefinitionId,
  WorkflowRunState,
  WorkflowStartRequest,
  WorkflowStartResult,
  WorkflowTransitionInput,
} from '@nous/shared';
import { buildDerivedWorkflowGraph } from './graph-builder.js';
import { evaluateWorkflowAdmission } from './admission.js';
import {
  completeWorkflowNodeInRunState,
  createInitialWorkflowRunState,
  pauseWorkflowRunState,
  resumeWorkflowRunState,
} from './run-state.js';

const clone = <T>(value: T): T => structuredClone(value);

export class DeterministicWorkflowEngine implements IWorkflowEngine {
  private readonly graphs = new Map<WorkflowExecutionId, DerivedWorkflowGraph>();

  private readonly states = new Map<WorkflowExecutionId, WorkflowRunState>();

  async resolveDefinition(
    projectConfig: WorkflowStartRequest['projectConfig'],
    workflowDefinitionId?: WorkflowStartRequest['workflowDefinitionId'],
  ): Promise<WorkflowDefinition> {
    const workflowConfig = projectConfig.workflow;
    if (!workflowConfig || workflowConfig.definitions.length === 0) {
      throw new Error('workflow definition not configured for project');
    }

    if (workflowDefinitionId) {
      const requested = workflowConfig.definitions.find(
        (definition) => definition.id === workflowDefinitionId,
      );
      if (!requested) {
        throw new Error(
          `workflow definition ${workflowDefinitionId} not found in project config`,
        );
      }
      return requested;
    }

    if (workflowConfig.defaultWorkflowDefinitionId) {
      const requested = workflowConfig.definitions.find(
        (definition) =>
          definition.id === workflowConfig.defaultWorkflowDefinitionId,
      );
      if (!requested) {
        throw new Error(
          `default workflow definition ${workflowConfig.defaultWorkflowDefinitionId} not found`,
        );
      }
      return requested;
    }

    if (workflowConfig.definitions.length === 1) {
      return workflowConfig.definitions[0];
    }

    throw new Error(
      'multiple workflow definitions configured without defaultWorkflowDefinitionId',
    );
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

    const runId = randomUUID() as WorkflowExecutionId;
    const runState = createInitialWorkflowRunState({
      runId,
      graph,
      admission,
      transition: {
        reasonCode: 'workflow_started',
        evidenceRefs:
          request.admissionEvidenceRefs ?? [`workflow_definition_id=${definition.id}`],
      },
      startedAt: request.startedAt,
    });

    this.graphs.set(runId, graph);
    this.states.set(runId, runState);

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

  async getState(
    executionId: WorkflowExecutionId,
  ): Promise<WorkflowRunState | null> {
    const state = this.states.get(executionId);
    return state ? clone(state) : null;
  }
}
