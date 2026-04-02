import { randomUUID } from 'node:crypto';
import {
  NousError,
  ProjectConfigSchema,
  WorkflowLifecycleDefinitionSummarySchema,
  WorkflowLifecycleInspectResultSchema,
  WorkflowLifecycleInstanceSummarySchema,
  WorkflowLifecycleListResultSchema,
  WorkflowLifecycleMutationResultSchema,
  WorkflowLifecycleStatusResultSchema,
  type AgentClass,
  type CriticalActionCategory,
  type GatewayExecutionContext,
  type AppPermissions,
  type IPromotedMemoryBridgeService,
  type IPublicMcpSurfaceService,
  type ProjectConfig,
  type ProjectControlState,
  type ProjectId,
  type AppHealthSnapshot,
  type AppHeartbeatSignal,
  type ResolvedWorkflowDefinitionSource,
  type ToolResult,
  type TraceEvidenceReference,
  type WitnessActor,
  type WitnessEventId,
  type WorkflowDefinitionId,
  type WorkflowLifecycleDefinitionSummary,
  type WorkflowLifecycleInspectResult,
  type WorkflowLifecycleInstanceSummary,
  type WorkflowRunState,
  type WorkflowDefinition,
  type DerivedWorkflowGraph,
} from '@nous/shared';
import { buildDispatchMetadata } from './dispatch-metadata.js';
import {
  inspectInstalledWorkflowPackage,
  listInstalledWorkflowPackages,
  loadInstalledSkillPackage,
} from '@nous/subcortex-projects';
import {
  parseWorkflowSpec,
  specToWorkflowDefinition,
} from '@nous/subcortex-workflows';
import {
  parseArtifactRetrieveRequest,
  parseArtifactStoreRequest,
  parseCredentialInjectRequest,
  parseCredentialRevokeRequest,
  parseCredentialStoreRequest,
  parseEscalationNotifyRequest,
  parseExternalMemoryCompactCommand,
  parseExternalMemoryDeleteCommand,
  parseExternalMemoryGetQuery,
  parseExternalMemoryPutCommand,
  parseExternalMemorySearchQuery,
  parseHealthHeartbeatRequest,
  parseHealthReportRequest,
  parseMemorySearchRequest,
  parseMemoryWriteRequest,
  parsePromotedMemoryDemoteCommand,
  parsePromotedMemoryGetQuery,
  parsePromotedMemoryPromoteCommand,
  parsePromotedMemorySearchQuery,
  parsePublicMcpAgentInvokeArguments,
  parsePublicMcpExecutionRequest,
  parseProjectDiscoverRequest,
  parseSchedulerRegisterRequest,
  parseToolExecuteRequest,
  parseToolListRequest,
  parseWitnessCheckpointRequest,
  parseWorkflowCancelRequest,
  parseWorkflowInspectRequest,
  parseWorkflowListRequest,
  parseWorkflowPauseRequest,
  parseWorkflowResumeRequest,
  parseWorkflowStartRequest,
  parseWorkflowStatusRequest,
  parseWorkflowValidateRequest,
  parseWorkflowFromSpecRequest,
  parseWorkflowCreateRequest,
  parseWorkflowUpdateRequest,
  parseWorkflowDeleteRequest,
  parseWorkflowExecuteNodeRequest,
  parseWorkflowCompleteNodeRequest,
} from './request-normalizers.js';
import type {
  InternalMcpCapabilityHandler,
  InternalMcpHandlerContext,
  InternalMcpToolName,
} from './types.js';

const WITNESS_ACTOR_BY_CLASS: Record<AgentClass, WitnessActor> = {
  'Cortex::Principal': 'principal',
  'Cortex::System': 'system',
  Orchestrator: 'orchestration_agent',
  Worker: 'worker_agent',
};

type CapabilityToolName = Exclude<
  InternalMcpToolName,
  'dispatch_orchestrator' | 'dispatch_worker' | 'task_complete' | 'request_escalation' | 'flag_observation'
>;

interface WorkflowSelection {
  workflowDefinitionId: WorkflowDefinitionId;
  definitionName: string;
  projectConfig: ProjectConfig;
  definitionSource: ResolvedWorkflowDefinitionSource | null;
  workflowPackageId?: string;
  workflowInspect?: WorkflowLifecycleInspectResult;
}

function requireExternalSourceMemoryService(context: InternalMcpHandlerContext) {
  if (!context.deps.externalSourceMemoryService) {
    throw new NousError(
      'Public external memory service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.externalSourceMemoryService;
}

function requirePublicMcpSurfaceService(
  context: InternalMcpHandlerContext,
): IPublicMcpSurfaceService {
  if (!context.deps.publicMcpSurfaceService) {
    throw new NousError(
      'Public MCP surface service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.publicMcpSurfaceService;
}

function requirePromotedMemoryBridgeService(
  context: InternalMcpHandlerContext,
): IPromotedMemoryBridgeService {
  if (!context.deps.promotedMemoryBridgeService) {
    throw new NousError(
      'Promoted memory bridge service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.promotedMemoryBridgeService;
}

function requireWorkflowEngine(context: InternalMcpHandlerContext) {
  if (!context.deps.workflowEngine) {
    throw new NousError(
      'Workflow engine is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.workflowEngine;
}

function requirePackageRuntime(context: InternalMcpHandlerContext) {
  if (!context.deps.runtime) {
    throw new NousError(
      'Workflow package runtime is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return {
    runtime: context.deps.runtime,
    instanceRoot: context.deps.instanceRoot ?? process.cwd(),
  };
}

async function requireSystemAgent(
  context: InternalMcpHandlerContext,
  toolName: string,
  execution?: GatewayExecutionContext,
): Promise<void> {
  if (context.agentClass === 'Cortex::System') {
    return;
  }

  return denyWithWitness({
    context,
    actionCategory: toolName.startsWith('workflow_')
      ? 'opctl-command'
      : toolName === 'promoted_memory_get' || toolName === 'promoted_memory_search'
        ? 'tool-execute'
        : 'memory-write',
    actionRef: toolName,
    projectId: execution?.projectId,
    traceId: execution?.traceId,
    reason: `${toolName} is restricted to Cortex::System`,
  });
}

function requireProjectId(
  toolName: string,
  execution?: GatewayExecutionContext,
): ProjectId {
  if (!execution?.projectId) {
    throw new NousError(
      `Tool ${toolName} requires execution.projectId`,
      'PROJECT_SCOPE_REQUIRED',
    );
  }

  return execution.projectId;
}

function requireAppExecutionContext(
  toolName: string,
  execution?: GatewayExecutionContext,
): { appId: string; projectId?: ProjectId } {
  if (!execution?.appId) {
    throw new NousError(
      `Tool ${toolName} requires execution.appId`,
      'PROJECT_SCOPE_REQUIRED',
    );
  }

  return {
    appId: execution.appId,
    projectId: execution.projectId,
  };
}

function requireAppCredentialPolicy(
  context: InternalMcpHandlerContext,
  appId: string,
  projectId?: ProjectId,
): Pick<AppPermissions, 'credentials' | 'network'> {
  const policy = context.deps.getAppPermissions?.(appId, projectId);
  if (!policy) {
    throw new NousError(
      `App credential policy is unavailable for ${appId}`,
      'SERVICE_UNAVAILABLE',
    );
  }
  if (!policy.credentials) {
    throw new NousError(
      `Credential access is not granted for ${appId}`,
      'TOOL_DENIED',
    );
  }
  return policy;
}

function requireProjectApi(
  context: InternalMcpHandlerContext,
  projectId: ProjectId,
) {
  const api = context.deps.getProjectApi?.(projectId);
  if (!api) {
    throw new NousError(
      `Project API is not available for ${projectId}`,
      'PROJECT_API_UNAVAILABLE',
    );
  }

  return api;
}

async function requireProjectControlState(
  context: InternalMcpHandlerContext,
  projectId: ProjectId,
): Promise<ProjectControlState> {
  if (!context.deps.opctlService) {
    throw new NousError(
      'Workflow lifecycle mutations require opctlService',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.opctlService.getProjectControlState(projectId);
}

async function executeWithWitness<T>(args: {
  context: InternalMcpHandlerContext;
  actionCategory: CriticalActionCategory;
  actionRef: string;
  projectId?: ProjectId;
  traceId?: GatewayExecutionContext['traceId'];
  detail: Record<string, unknown>;
  operation: () => Promise<T>;
}): Promise<{
  value: T;
  evidenceRef?: TraceEvidenceReference;
  authorizationEventId?: WitnessEventId;
  completionEventId?: WitnessEventId;
}> {
  const service = args.context.deps.witnessService;
  if (!service) {
    return { value: await args.operation() };
  }

  const authorization = await service.appendAuthorization({
    actionCategory: args.actionCategory,
    actionRef: args.actionRef,
    actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
    status: 'approved',
    detail: args.detail,
    projectId: args.projectId,
    traceId: args.traceId,
  });

  try {
    const value = await args.operation();
    const completion = await service.appendCompletion({
      actionCategory: args.actionCategory,
      actionRef: args.actionRef,
      authorizationRef: authorization.id,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'succeeded',
      detail: args.detail,
      projectId: args.projectId,
      traceId: args.traceId,
    });

    return {
      value,
      authorizationEventId: authorization.id,
      completionEventId: completion.id,
      evidenceRef: {
        actionCategory: args.actionCategory,
        authorizationEventId: authorization.id,
        completionEventId: completion.id,
      },
    };
  } catch (error) {
    await service.appendCompletion({
      actionCategory: args.actionCategory,
      actionRef: args.actionRef,
      authorizationRef: authorization.id,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'failed',
      detail: {
        ...args.detail,
        error: error instanceof Error ? error.message : String(error),
      },
      projectId: args.projectId,
      traceId: args.traceId,
    });
    throw error;
  }
}

async function denyWithWitness(args: {
  context: InternalMcpHandlerContext;
  actionCategory: CriticalActionCategory;
  actionRef: string;
  projectId?: ProjectId;
  traceId?: GatewayExecutionContext['traceId'];
  reason: string;
}): Promise<never> {
  const service = args.context.deps.witnessService;
  if (service) {
    const authorization = await service.appendAuthorization({
      actionCategory: args.actionCategory,
      actionRef: args.actionRef,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'denied',
      detail: { reason: args.reason },
      projectId: args.projectId,
      traceId: args.traceId,
    });
    await service.appendCompletion({
      actionCategory: args.actionCategory,
      actionRef: args.actionRef,
      authorizationRef: authorization.id,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'blocked',
      detail: { reason: args.reason },
      projectId: args.projectId,
      traceId: args.traceId,
    });
  }

  throw new NousError(args.reason, 'TOOL_DENIED');
}

function success(output: unknown, durationMs = 0): ToolResult {
  return {
    success: true,
    output,
    durationMs,
  };
}

function buildLifecycleLane(definitionName: string, runId: string, event: string) {
  const laneRoot = `workflow:${definitionName}:${runId}`;
  return {
    laneRoot,
    lane: `${laneRoot} > lifecycle:${event}`,
    laneDepth: 1,
  };
}

function toWorkflowInstanceSummary(input: {
  runState: WorkflowRunState;
  definitionName: string;
  definitionSource?: ResolvedWorkflowDefinitionSource | null;
  graph?: DerivedWorkflowGraph | null;
}): WorkflowLifecycleInstanceSummary {
  const { runState, graph } = input;

  const readyNodeDispatchMetadata = buildDispatchMetadata({
    readyNodeIds: runState.readyNodeIds,
    graph,
    dispatchLineage: runState.dispatchLineage,
  });

  return WorkflowLifecycleInstanceSummarySchema.parse({
    runId: runState.runId,
    projectId: runState.projectId,
    workflowDefinitionId: runState.workflowDefinitionId,
    definitionName: input.definitionName,
    status: runState.status,
    reasonCode: runState.reasonCode,
    activeNodeIds: runState.activeNodeIds,
    waitingNodeIds: runState.waitingNodeIds,
    blockedNodeIds: runState.blockedNodeIds,
    checkpointState: runState.checkpointState,
    lastCommittedCheckpointId: runState.lastCommittedCheckpointId,
    startedAt: runState.startedAt,
    updatedAt: runState.updatedAt,
    definitionSource: input.definitionSource ?? undefined,
    readyNodeIds: runState.readyNodeIds,
    readyNodeDispatchMetadata,
  });
}

async function resolveProjectConfig(
  context: InternalMcpHandlerContext,
  projectId: ProjectId,
): Promise<ProjectConfig> {
  const fromStore = await context.deps.projectStore?.get(projectId);
  if (fromStore) {
    return ProjectConfigSchema.parse(fromStore);
  }

  return ProjectConfigSchema.parse(
    requireProjectApi(context, projectId).project.config(),
  );
}

async function resolveWorkflowSelection(
  context: InternalMcpHandlerContext,
  projectConfig: ProjectConfig,
  definitionRef: string,
  entrypoint?: string,
): Promise<WorkflowSelection> {
  const inlineMatch = projectConfig.workflow?.definitions.filter(
    (definition) =>
      definition.id === definitionRef || definition.name === definitionRef,
  ) ?? [];

  const packageBindings = projectConfig.workflow?.packageBindings ?? [];
  const packageRuntime = packageBindings.length > 0
    ? requirePackageRuntime(context)
    : null;
  const bindingCandidates: Array<WorkflowSelection | null> = await Promise.all(
    packageBindings.map(async (binding) => {
      if (!packageRuntime) {
        return null;
      }
      const workflowInspect = await inspectInstalledWorkflowPackage({
        instanceRoot: packageRuntime.instanceRoot,
        runtime: packageRuntime.runtime,
        packageId: binding.workflowPackageId,
      });
      const matches =
        binding.workflowDefinitionId === definitionRef ||
        binding.workflowPackageId === definitionRef ||
        workflowInspect.manifest.name === definitionRef;
      return matches
        ? {
            workflowDefinitionId: binding.workflowDefinitionId,
            definitionName: workflowInspect.manifest.name,
            projectConfig:
              entrypoint && entrypoint !== binding.entrypoint
                ? ProjectConfigSchema.parse({
                    ...projectConfig,
                    workflow: {
                      ...projectConfig.workflow,
                      packageBindings: (projectConfig.workflow?.packageBindings ?? []).map(
                        (candidate) =>
                          candidate.workflowDefinitionId === binding.workflowDefinitionId
                            ? { ...candidate, entrypoint }
                            : candidate,
                      ),
                    },
                  })
                : projectConfig,
            definitionSource: null,
            workflowPackageId: binding.workflowPackageId,
            workflowInspect,
          }
        : null;
    }),
  );

  const matches: WorkflowSelection[] = [
    ...inlineMatch.map((definition) => ({
      workflowDefinitionId: definition.id,
      definitionName: definition.name,
      projectConfig,
      definitionSource: null,
    })),
    ...bindingCandidates.filter((candidate): candidate is WorkflowSelection => candidate != null),
  ];

  if (matches.length === 0) {
    throw new NousError(
      `Workflow definition ${definitionRef} is not configured for project ${projectConfig.id}`,
      'WORKFLOW_DEFINITION_NOT_FOUND',
    );
  }

  if (matches.length > 1) {
    throw new NousError(
      `Workflow definition ${definitionRef} is ambiguous for project ${projectConfig.id}`,
      'WORKFLOW_DEFINITION_AMBIGUOUS',
      {
        matches: matches.map((match) => ({
          workflowDefinitionId: match.workflowDefinitionId,
          definitionName: match.definitionName,
          workflowPackageId: match.workflowPackageId,
        })),
      },
    );
  }

  const selected = matches[0]!;
  if (
    selected.workflowInspect &&
    entrypoint &&
    !selected.workflowInspect.manifest.entrypoints?.includes(entrypoint) &&
    selected.workflowInspect.manifest.entrypoint !== entrypoint
  ) {
    throw new NousError(
      `Workflow entrypoint ${entrypoint} is not exported by ${selected.workflowInspect.packageId}`,
      'WORKFLOW_ENTRYPOINT_NOT_FOUND',
    );
  }

  return selected;
}

async function collectWorkflowDependencyWarnings(input: {
  context: InternalMcpHandlerContext;
  projectId: ProjectId;
  workflowInspect?: WorkflowLifecycleInspectResult;
}): Promise<string[]> {
  if (!input.workflowInspect) {
    return [];
  }

  const projectApi = requireProjectApi(input.context, input.projectId);
  const tools = await projectApi.tool.list();
  const availableToolNames = new Set(tools.map((tool) => tool.name));
  const missingRequiredTools = input.workflowInspect.manifest.dependencies?.tools
    ?.filter((dependency) => dependency.required !== false)
    .map((dependency) => dependency.name)
    .filter((name) => !availableToolNames.has(name)) ?? [];

  if (missingRequiredTools.length > 0) {
    throw new NousError(
      `Workflow is missing required tools: ${missingRequiredTools.join(', ')}`,
      'WORKFLOW_REQUIRED_TOOL_MISSING',
      {
        missingRequiredTools,
        packageId: input.workflowInspect.packageId,
      },
    );
  }

  const packageRuntime = requirePackageRuntime(input.context);
  const warnings: string[] = [];
  for (const dependency of input.workflowInspect.manifest.dependencies?.skills ?? []) {
    try {
      await loadInstalledSkillPackage({
        instanceRoot: packageRuntime.instanceRoot,
        runtime: packageRuntime.runtime,
        packageId: dependency.name,
      });
    } catch {
      warnings.push(
        `Optional skill dependency ${dependency.name} is not installed for workflow ${input.workflowInspect.packageId}`,
      );
    }
  }

  return warnings;
}

async function resolveRunProjection(
  context: InternalMcpHandlerContext,
  runState: WorkflowRunState,
): Promise<{
  summary: WorkflowLifecycleInstanceSummary;
  projectConfig: ProjectConfig | null;
  definitionSource: ResolvedWorkflowDefinitionSource | null;
}> {
  const projectConfig = (await context.deps.projectStore?.get(runState.projectId)) ?? null;
  const definitionSource = projectConfig
    ? await requireWorkflowEngine(context).resolveDefinitionSource(
        projectConfig,
        runState.workflowDefinitionId,
      )
    : null;

  let definitionName: string = runState.workflowDefinitionId;
  if (projectConfig) {
    try {
      const definition = await requireWorkflowEngine(context).resolveDefinition(
        projectConfig,
        runState.workflowDefinitionId,
      );
      definitionName = definition.name;
    } catch {
      definitionName = runState.workflowDefinitionId;
    }
  }

  // Retrieve graph for dispatch metadata construction
  const graph = await requireWorkflowEngine(context).getRunGraph(
    runState.runId,
  );

  return {
    summary: toWorkflowInstanceSummary({
      runState,
      definitionName,
      definitionSource,
      graph,
    }),
    projectConfig,
    definitionSource,
  };
}

function collectGovernanceGateHits(runState: WorkflowRunState): string[] {
  return [...new Set(
    Object.values(runState.nodeStates)
      .flatMap((nodeState) => {
        const hits: string[] = [];
        if (nodeState.latestGovernanceDecision?.reasonCode) {
          hits.push(nodeState.latestGovernanceDecision.reasonCode);
        }
        if (nodeState.status === 'blocked' && nodeState.reasonCode) {
          hits.push(nodeState.reasonCode);
        }
        return hits;
      }),
  )];
}

async function listWorkflowInstances(
  context: InternalMcpHandlerContext,
  projectId?: ProjectId,
): Promise<WorkflowLifecycleInstanceSummary[]> {
  const workflowEngine = requireWorkflowEngine(context);
  const runStates = projectId
    ? await workflowEngine.listProjectRuns(projectId)
    : context.deps.projectStore
      ? (
          await Promise.all(
            (await context.deps.projectStore.list()).map((project) =>
              workflowEngine.listProjectRuns(project.id),
            ),
          )
        ).flat()
      : [];

  const projections = await Promise.all(
    runStates.map((runState) => resolveRunProjection(context, runState)),
  );
  return projections.map((projection) => projection.summary);
}

export function createCapabilityHandlers(
  context: InternalMcpHandlerContext,
): Record<CapabilityToolName, InternalMcpCapabilityHandler> {
  return {
    memory_search: async (params, execution) => {
      const projectId = requireProjectId('memory_search', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseMemorySearchRequest(params);

      if (request.mode === 'retrieve') {
        return success(
          await api.memory.retrieve(request.situation, request.budget),
          0,
        );
      }

      return success(
        await api.memory.read(request.query, request.scope as 'global' | 'project'),
        0,
      );
    },
    memory_write: async (params, execution) => {
      const projectId = requireProjectId('memory_write', execution);
      const api = requireProjectApi(context, projectId);
      const candidate = parseMemoryWriteRequest(params);
      const decision = await context.deps.pfc?.evaluateMemoryWrite(candidate, projectId);

      if (decision && !decision.approved) {
        return denyWithWitness({
          context,
          actionCategory: 'memory-write',
          actionRef: candidate.type,
          projectId,
          traceId: execution?.traceId,
          reason: decision.reason ?? 'memory_write denied by policy',
        });
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'memory-write',
        actionRef: candidate.type,
        projectId,
        traceId: execution?.traceId,
        detail: { candidateType: candidate.type },
        operation: () => api.memory.write(candidate),
      });

      return success(
        {
          memoryEntryId: result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    external_memory_put: async (params) => {
      const service = requireExternalSourceMemoryService(context);
      return success(await service.put(parseExternalMemoryPutCommand(params)), 0);
    },
    external_memory_get: async (params) => {
      const service = requireExternalSourceMemoryService(context);
      return success(await service.get(parseExternalMemoryGetQuery(params)), 0);
    },
    external_memory_search: async (params) => {
      const service = requireExternalSourceMemoryService(context);
      return success(await service.search(parseExternalMemorySearchQuery(params)), 0);
    },
    external_memory_delete: async (params) => {
      const service = requireExternalSourceMemoryService(context);
      return success(await service.delete(parseExternalMemoryDeleteCommand(params)), 0);
    },
    external_memory_compact: async (params) => {
      const service = requireExternalSourceMemoryService(context);
      return success(await service.compact(parseExternalMemoryCompactCommand(params)), 0);
    },
    public_agent_list: async (params) => {
      const service = requirePublicMcpSurfaceService(context);
      const request = parsePublicMcpExecutionRequest(params);
      return success(
        {
          agents: await service.listAgents({
            requestId: request.requestId,
            subject: request.subject,
            requestedAt: request.requestedAt,
          }),
        },
        0,
      );
    },
    public_agent_invoke: async (params) => {
      const service = requirePublicMcpSurfaceService(context);
      const request = parsePublicMcpExecutionRequest(params);
      return success(
        await service.invokeAgent({
          requestId: request.requestId,
          subject: request.subject,
          requestedAt: request.requestedAt,
          arguments: parsePublicMcpAgentInvokeArguments(request.arguments),
        }),
        0,
      );
    },
    public_system_info: async (params) => {
      const service = requirePublicMcpSurfaceService(context);
      const request = parsePublicMcpExecutionRequest(params);
      return success(
        await service.getSystemInfo({
          requestId: request.requestId,
          subject: request.subject,
          requestedAt: request.requestedAt,
        }),
        0,
      );
    },
    promoted_memory_promote: async (params, execution) => {
      await requireSystemAgent(context, 'promoted_memory_promote', execution);
      const service = requirePromotedMemoryBridgeService(context);
      return success(
        await service.promote(parsePromotedMemoryPromoteCommand(params)),
        0,
      );
    },
    promoted_memory_demote: async (params, execution) => {
      await requireSystemAgent(context, 'promoted_memory_demote', execution);
      const service = requirePromotedMemoryBridgeService(context);
      return success(
        await service.demote(parsePromotedMemoryDemoteCommand(params)),
        0,
      );
    },
    promoted_memory_get: async (params, execution) => {
      await requireSystemAgent(context, 'promoted_memory_get', execution);
      const service = requirePromotedMemoryBridgeService(context);
      return success(
        await service.get(parsePromotedMemoryGetQuery(params)),
        0,
      );
    },
    promoted_memory_search: async (params, execution) => {
      await requireSystemAgent(context, 'promoted_memory_search', execution);
      const service = requirePromotedMemoryBridgeService(context);
      return success(
        await service.search(parsePromotedMemorySearchQuery(params)),
        0,
      );
    },
    project_discover: async (params, execution) => {
      const projectId = requireProjectId('project_discover', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseProjectDiscoverRequest(params);

      return success({
        config: request.includeConfig ? api.project.config() : undefined,
        state: request.includeState ? api.project.state() : undefined,
      });
    },
    artifact_store: async (params, execution) => {
      const projectId = requireProjectId('artifact_store', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseArtifactStoreRequest(params);

      const decision = await context.deps.pfc?.evaluateToolExecution(
        'artifact_store',
        { name: request.name, mimeType: request.mimeType },
        projectId,
      );

      if (decision && !decision.approved) {
        return denyWithWitness({
          context,
          actionCategory: 'trace-persist',
          actionRef: 'artifact_store',
          projectId,
          traceId: execution?.traceId,
          reason: decision.reason ?? 'artifact_store denied by policy',
        });
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'artifact_store',
        projectId,
        traceId: execution?.traceId,
        detail: { name: request.name, mimeType: request.mimeType },
        operation: () => api.artifact.store(request),
      });

      return success(
        {
          ...result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    artifact_retrieve: async (params, execution) => {
      const projectId = requireProjectId('artifact_retrieve', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseArtifactRetrieveRequest(params);

      return success(
        await api.artifact.retrieve(request),
        0,
      );
    },
    tool_execute: async (params, execution) => {
      const projectId = requireProjectId('tool_execute', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseToolExecuteRequest(params);
      const decision = await context.deps.pfc?.evaluateToolExecution(
        request.name,
        request.params ?? {},
        projectId,
      );

      if (decision && !decision.approved) {
        return denyWithWitness({
          context,
          actionCategory: 'tool-execute',
          actionRef: request.name,
          projectId,
          traceId: execution?.traceId,
          reason: decision.reason ?? 'tool_execute denied by policy',
        });
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'tool-execute',
        actionRef: request.name,
        projectId,
        traceId: execution?.traceId,
        detail: { toolName: request.name },
        operation: () => api.tool.execute(request.name, request.params ?? {}),
      });

      return success(
        {
          ...result.value,
          evidenceRef: result.evidenceRef,
        },
        result.value.durationMs,
      );
    },
    tool_list: async (params, execution) => {
      const projectId = requireProjectId('tool_list', execution);
      const api = requireProjectApi(context, projectId);
      const request = parseToolListRequest(params);
      return success(await api.tool.list(request.capabilities), 0);
    },
    witness_checkpoint: async (params, execution) => {
      const request = parseWitnessCheckpointRequest(params);
      const service = context.deps.witnessService;
      if (!service) {
        throw new NousError(
          'witness_checkpoint requires witnessService',
          'SERVICE_UNAVAILABLE',
        );
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'witness_checkpoint',
        projectId: execution?.projectId,
        traceId: execution?.traceId,
        detail: { reason: request.reason },
        operation: () =>
          service.createCheckpoint(
            request.reason as 'interval' | 'manual' | 'rotation' | undefined,
          ),
      });

      return success(
        {
          checkpoint: result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    escalation_notify: async (params, execution) => {
      const projectId = requireProjectId('escalation_notify', execution);
      const request = parseEscalationNotifyRequest(params);
      const service = context.deps.escalationService;
      if (!service) {
        throw new NousError(
          'escalation_notify requires escalationService',
          'SERVICE_UNAVAILABLE',
        );
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'escalation_notify',
        projectId,
        traceId: execution?.traceId,
        detail: { priority: request.priority, channel: request.channel },
        operation: () =>
          service.notify({
            ...request,
            projectId,
          }),
      });

      return success(
        {
          escalationId: result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    scheduler_register: async (params, execution) => {
      const projectId = requireProjectId('scheduler_register', execution);
      const request = parseSchedulerRegisterRequest(params);
      const scheduler = context.deps.scheduler;
      if (!scheduler) {
        throw new NousError(
          'scheduler_register requires scheduler',
          'SERVICE_UNAVAILABLE',
        );
      }

      const normalized = {
        ...request,
        projectId,
      };
      const decision = await context.deps.pfc?.evaluateToolExecution(
        'scheduler_register',
        normalized,
        projectId,
      );

      if (decision && !decision.approved) {
        return denyWithWitness({
          context,
          actionCategory: 'trace-persist',
          actionRef: 'scheduler_register',
          projectId,
          traceId: execution?.traceId,
          reason: decision.reason ?? 'scheduler_register denied by policy',
        });
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'scheduler_register',
        projectId,
        traceId: execution?.traceId,
        detail: { workflowDefinitionId: normalized.workflowDefinitionId },
        operation: () => scheduler.register(normalized),
      });

      return success(
        {
          scheduleId: result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    health_report: async (params) => {
      const request = parseHealthReportRequest(params) as AppHealthSnapshot;
      const appRuntimeService = context.deps.appRuntimeService;
      if (!appRuntimeService) {
        throw new NousError(
          'App runtime service is unavailable',
          'SERVICE_UNAVAILABLE',
        );
      }

      const health = await appRuntimeService.updateHealth(request);
      return success(
        {
          accepted: true,
          health,
        },
        0,
      );
    },
    credentials_store: async (params, execution) => {
      const { appId, projectId } = requireAppExecutionContext(
        'credentials_store',
        execution,
      );
      const policy = requireAppCredentialPolicy(context, appId, projectId);
      const request = parseCredentialStoreRequest(params);
      const vaultService = context.deps.credentialVaultService;
      if (!vaultService) {
        throw new NousError(
          'Credential vault service is unavailable',
          'SERVICE_UNAVAILABLE',
        );
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'credentials_store',
        projectId,
        traceId: execution?.traceId,
        detail: {
          appId,
          key: request.key,
          targetHost: request.target_host,
          credentialType: request.credential_type,
          credentialPermission: policy.credentials,
        },
        operation: () => vaultService.store(appId, request),
      });

      return success(
        {
          ...result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    credentials_inject: async (params, execution) => {
      const { appId, projectId } = requireAppExecutionContext(
        'credentials_inject',
        execution,
      );
      const policy = requireAppCredentialPolicy(context, appId, projectId);
      const request = parseCredentialInjectRequest(params);
      const credentialInjector = context.deps.credentialInjector;
      if (!credentialInjector) {
        throw new NousError(
          'Credential injector is unavailable',
          'SERVICE_UNAVAILABLE',
        );
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'tool-execute',
        actionRef: 'credentials_inject',
        projectId,
        traceId: execution?.traceId,
        detail: {
          appId,
          key: request.key,
          url: request.request_descriptor.url,
        },
        operation: () =>
          credentialInjector.executeInjectedRequest({
            appId,
            request,
            manifestNetworkPermissions: policy.network,
          }),
      });

      return success(
        {
          ...result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    credentials_revoke: async (params, execution) => {
      const { appId, projectId } = requireAppExecutionContext(
        'credentials_revoke',
        execution,
      );
      requireAppCredentialPolicy(context, appId, projectId);
      const request = parseCredentialRevokeRequest(params);
      const vaultService = context.deps.credentialVaultService;
      if (!vaultService) {
        throw new NousError(
          'Credential vault service is unavailable',
          'SERVICE_UNAVAILABLE',
        );
      }

      const result = await executeWithWitness({
        context,
        actionCategory: 'trace-persist',
        actionRef: 'credentials_revoke',
        projectId,
        traceId: execution?.traceId,
        detail: {
          appId,
          key: request.key,
          reason: request.reason,
        },
        operation: () => vaultService.revoke(appId, request),
      });

      return success(
        {
          ...result.value,
          evidenceRef: result.evidenceRef,
        },
        0,
      );
    },
    health_heartbeat: async (params) => {
      const request = parseHealthHeartbeatRequest(params) as AppHeartbeatSignal;
      const appRuntimeService = context.deps.appRuntimeService;
      if (!appRuntimeService) {
        throw new NousError(
          'App runtime service is unavailable',
          'SERVICE_UNAVAILABLE',
        );
      }

      await appRuntimeService.recordHeartbeat(request);
      return success(
        {
          accepted: true,
          heartbeat: request,
        },
        0,
      );
    },
    workflow_list: async (params) => {
      const request = parseWorkflowListRequest(params);
      const definitions = request.includeInstalledDefinitions
        ? await listInstalledWorkflowPackages({
            ...requirePackageRuntime(context),
          })
        : [];
      const instances = request.includeActiveInstances
        ? await listWorkflowInstances(context, request.projectId)
        : [];

      const definitionFilter = request.definition?.toLowerCase();
      const filteredDefinitions = definitions.filter(
        (definition: WorkflowLifecycleDefinitionSummary) =>
        definitionFilter
          ? definition.name.toLowerCase().includes(definitionFilter) ||
            definition.packageId.toLowerCase().includes(definitionFilter)
          : true,
      );
      const filteredInstances = instances.filter((instance) => {
        if (request.status.length > 0 && !request.status.includes(instance.status)) {
          return false;
        }
        if (!definitionFilter) {
          return true;
        }
        return (
          instance.definitionName.toLowerCase().includes(definitionFilter) ||
          instance.workflowDefinitionId.toLowerCase().includes(definitionFilter)
        );
      });

      return success(
        WorkflowLifecycleListResultSchema.parse({
          definitions: filteredDefinitions.map(
            (definition: WorkflowLifecycleDefinitionSummary) =>
            WorkflowLifecycleDefinitionSummarySchema.parse(definition),
          ),
          instances: filteredInstances,
        }),
        0,
      );
    },
    workflow_inspect: async (params) => {
      const request = parseWorkflowInspectRequest(params);
      return success(
        WorkflowLifecycleInspectResultSchema.parse(
          await inspectInstalledWorkflowPackage({
            ...requirePackageRuntime(context),
            packageId: request.packageId,
          }),
        ),
        0,
      );
    },
    workflow_start: async (params, execution) => {
      const request = parseWorkflowStartRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const projectConfig = await resolveProjectConfig(context, request.projectId);

      let selection: WorkflowSelection;

      if (request.yamlSpec) {
        // Parse YAML spec → validate → convert to workflow definition → inject
        const parseResult = parseWorkflowSpec(request.yamlSpec);
        if (!parseResult.success) {
          return {
            success: false,
            output: { valid: false, errors: parseResult.errors },
            durationMs: 0,
          };
        }

        const specDefinition = specToWorkflowDefinition(parseResult.data, {
          projectId: request.projectId,
        });

        // Inject the spec-derived definition into project config
        const augmentedConfig = ProjectConfigSchema.parse({
          ...projectConfig,
          workflow: {
            ...projectConfig.workflow,
            definitions: [
              ...(projectConfig.workflow?.definitions ?? []),
              specDefinition,
            ],
          },
        });

        selection = {
          workflowDefinitionId: specDefinition.id,
          definitionName: specDefinition.name,
          projectConfig: augmentedConfig,
          definitionSource: null,
        };
      } else {
        selection = await resolveWorkflowSelection(
          context,
          projectConfig,
          request.definition!,
          request.entrypoint,
        );
      }
      const warnings = await collectWorkflowDependencyWarnings({
        context,
        projectId: request.projectId,
        workflowInspect: selection.workflowInspect,
      });
      const controlState = await requireProjectControlState(context, request.projectId);
      const runId = (context.deps.idFactory ?? randomUUID)() as WorkflowRunState['runId'];
      const lane = buildLifecycleLane(selection.definitionName, runId, 'started');

      const startedState = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: request.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: selection.workflowDefinitionId,
          definitionName: selection.definitionName,
          warnings,
          configKeys: Object.keys(request.config),
        },
        operation: async () => {
          const started = await workflowEngine.start({
            projectConfig: selection.projectConfig,
            workflowDefinitionId: selection.workflowDefinitionId as any,
            runId,
            workmodeId: execution?.workmodeId ?? 'system:implementation',
            sourceActor: 'nous_cortex',
            targetActor: 'worker_agent',
            controlState,
            triggerContext: request.triggerContext,
          });

          if (started.status !== 'started') {
            throw new NousError(
              started.admission.reasonCode,
              'WORKFLOW_START_BLOCKED',
              {
                admission: started.admission,
              },
            );
          }

          return started.runState;
        },
      });

      const definitionSource = await workflowEngine.resolveDefinitionSource(
        selection.projectConfig,
        selection.workflowDefinitionId as any,
      );

      const startGraph = await workflowEngine.getRunGraph(
        startedState.value.runId,
      );

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: startedState.value,
            definitionName: selection.definitionName,
            definitionSource,
            graph: startGraph,
          }),
          evidenceRef: startedState.evidenceRef,
          warnings,
        }),
        0,
      );
    },
    workflow_status: async (params) => {
      const request = parseWorkflowStatusRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const runState = await workflowEngine.getState(request.runId);
      if (!runState) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }

      const projection = await resolveRunProjection(context, runState);
      return success(
        WorkflowLifecycleStatusResultSchema.parse({
          run: projection.summary,
          readyNodeIds: runState.readyNodeIds,
          completedNodeIds: runState.completedNodeIds,
          activatedEdgeIds: runState.activatedEdgeIds,
          checkpointState: runState.checkpointState,
          lastPreparedCheckpointId: runState.lastPreparedCheckpointId,
          lastCommittedCheckpointId: runState.lastCommittedCheckpointId,
          governanceGateHits: collectGovernanceGateHits(runState),
        }),
        0,
      );
    },
    workflow_pause: async (params, execution) => {
      const request = parseWorkflowPauseRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const current = await workflowEngine.getState(request.runId);
      if (!current) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }
      const controlState = await requireProjectControlState(context, current.projectId);
      if (controlState !== 'running') {
        throw new NousError(
          `workflow_pause denied while project control state is ${controlState}`,
          'WORKFLOW_PAUSE_DENIED',
          { controlState },
        );
      }

      const projection = await resolveRunProjection(context, current);
      const lane = buildLifecycleLane(projection.summary.definitionName, request.runId, 'paused');
      const result = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: current.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: current.workflowDefinitionId,
        },
        operation: () =>
          workflowEngine.pause(request.runId, {
            reasonCode: request.reasonCode,
            evidenceRefs: [],
          }),
      });

      const pauseGraph = await workflowEngine.getRunGraph(result.value.runId);

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: result.value,
            definitionName: projection.summary.definitionName,
            definitionSource: projection.definitionSource,
            graph: pauseGraph,
          }),
          evidenceRef: result.evidenceRef,
        }),
        0,
      );
    },
    workflow_resume: async (params, execution) => {
      const request = parseWorkflowResumeRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const current = await workflowEngine.getState(request.runId);
      if (!current) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }
      const projection = await resolveRunProjection(context, current);
      const controlState = await requireProjectControlState(context, current.projectId);
      if (controlState === 'hard_stopped') {
        throw new NousError(
          'workflow_resume_denied_hard_stopped',
          'WORKFLOW_RESUME_DENIED',
          { controlState },
        );
      }
      if (controlState !== 'running') {
        throw new NousError(
          `workflow_resume denied while project control state is ${controlState}`,
          'WORKFLOW_RESUME_DENIED',
          { controlState },
        );
      }

      const warnings = await collectWorkflowDependencyWarnings({
        context,
        projectId: current.projectId,
        workflowInspect:
          projection.definitionSource?.sourceKind === 'installed_package' &&
          projection.definitionSource.packageId
            ? await inspectInstalledWorkflowPackage({
                ...requirePackageRuntime(context),
                packageId: projection.definitionSource.packageId,
              })
            : undefined,
      });
      const lane = buildLifecycleLane(projection.summary.definitionName, request.runId, 'resumed');
      const result = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: current.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: current.workflowDefinitionId,
          warnings,
        },
        operation: () =>
          workflowEngine.resume(request.runId, {
            reasonCode: request.reasonCode,
            evidenceRefs: [],
          }),
      });

      const resumeGraph = await workflowEngine.getRunGraph(result.value.runId);

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: result.value,
            definitionName: projection.summary.definitionName,
            definitionSource: projection.definitionSource,
            graph: resumeGraph,
          }),
          evidenceRef: result.evidenceRef,
          warnings,
        }),
        0,
      );
    },
    workflow_execute_node: async (params, execution) => {
      const request = parseWorkflowExecuteNodeRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const current = await workflowEngine.getState(request.runId);
      if (!current) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }
      const controlState = await requireProjectControlState(context, current.projectId);
      const projection = await resolveRunProjection(context, current);
      const lane = buildLifecycleLane(
        projection.summary.definitionName,
        request.runId,
        `execute_node:${request.nodeDefinitionId}`,
      );

      const result = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: current.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: current.workflowDefinitionId,
          nodeDefinitionId: request.nodeDefinitionId,
        },
        operation: () =>
          workflowEngine.executeReadyNode({
            executionId: request.runId,
            nodeDefinitionId: request.nodeDefinitionId,
            controlState,
            transition: {
              reasonCode: 'node_execute_requested',
              evidenceRefs: [],
            },
            payload: request.payload != null ? { detail: { userPayload: request.payload } } : undefined,
          }),
      });

      const execGraph = await workflowEngine.getRunGraph(result.value.runId);

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: result.value,
            definitionName: projection.summary.definitionName,
            definitionSource: projection.definitionSource,
            graph: execGraph,
          }),
          evidenceRef: result.evidenceRef,
        }),
        0,
      );
    },
    workflow_complete_node: async (params, execution) => {
      const request = parseWorkflowCompleteNodeRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const current = await workflowEngine.getState(request.runId);
      if (!current) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }
      const projection = await resolveRunProjection(context, current);
      const lane = buildLifecycleLane(
        projection.summary.definitionName,
        request.runId,
        `complete_node:${request.nodeDefinitionId}`,
      );

      const transition = {
        reasonCode: request.reasonCode ?? (request.status === 'failed' ? 'node_failed' : 'node_completed_by_agent'),
        evidenceRefs: request.evidenceRefs,
        occurredAt: (context.deps.now ?? (() => new Date().toISOString()))(),
      };

      const result = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: current.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: current.workflowDefinitionId,
          nodeDefinitionId: request.nodeDefinitionId,
          status: request.status,
        },
        operation: () =>
          workflowEngine.completeNode(
            request.runId,
            request.nodeDefinitionId,
            transition,
          ),
      });

      const completeGraph = await workflowEngine.getRunGraph(result.value.runId);

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: result.value,
            definitionName: projection.summary.definitionName,
            definitionSource: projection.definitionSource,
            graph: completeGraph,
          }),
          evidenceRef: result.evidenceRef,
        }),
        0,
      );
    },
    workflow_cancel: async (params, execution) => {
      await requireSystemAgent(context, 'workflow_cancel', execution);
      const request = parseWorkflowCancelRequest(params);
      const workflowEngine = requireWorkflowEngine(context);
      const current = await workflowEngine.getState(request.runId);
      if (!current) {
        throw new NousError(
          `Workflow run ${request.runId} was not found`,
          'WORKFLOW_RUN_NOT_FOUND',
        );
      }
      const projection = await resolveRunProjection(context, current);
      const lane = buildLifecycleLane(
        projection.summary.definitionName,
        request.runId,
        'canceled',
      );
      const result = await executeWithWitness({
        context,
        actionCategory: 'opctl-command',
        actionRef: lane.lane,
        projectId: current.projectId,
        traceId: execution?.traceId,
        detail: {
          lane: lane.lane,
          laneRoot: lane.laneRoot,
          laneDepth: lane.laneDepth,
          workflowDefinitionId: current.workflowDefinitionId,
        },
        operation: () =>
          workflowEngine.cancel(request.runId, {
            reasonCode: request.reasonCode,
            evidenceRefs: [],
          }),
      });

      const cancelGraph = await workflowEngine.getRunGraph(result.value.runId);

      return success(
        WorkflowLifecycleMutationResultSchema.parse({
          run: toWorkflowInstanceSummary({
            runState: result.value,
            definitionName: projection.summary.definitionName,
            definitionSource: projection.definitionSource,
            graph: cancelGraph,
          }),
          evidenceRef: result.evidenceRef,
        }),
        0,
      );
    },

    workflow_validate: async (params) => {
      const request = parseWorkflowValidateRequest(params);
      const parseResult = parseWorkflowSpec(request.yamlSpec);

      if (parseResult.success) {
        return success({ valid: true }, 0);
      }

      return success({ valid: false, errors: parseResult.errors }, 0);
    },

    workflow_from_spec: async (params, execution) => {
      await requireSystemAgent(context, 'workflow_from_spec', execution);
      const request = parseWorkflowFromSpecRequest(params);

      const parseResult = parseWorkflowSpec(request.yamlSpec);
      if (!parseResult.success) {
        return {
          success: false,
          output: { valid: false, errors: parseResult.errors },
          durationMs: 0,
        };
      }

      const projectConfig = await resolveProjectConfig(context, request.projectId);
      const specDefinition = specToWorkflowDefinition(parseResult.data, {
        projectId: request.projectId,
      });

      // Persist the definition into the project's workflow configuration
      const updatedConfig = ProjectConfigSchema.parse({
        ...projectConfig,
        workflow: {
          ...projectConfig.workflow,
          definitions: [
            ...(projectConfig.workflow?.definitions ?? []),
            specDefinition,
          ],
        },
      });

      if (context.deps.projectStore) {
        await context.deps.projectStore.update(request.projectId, {
          workflow: updatedConfig.workflow,
        });
      }

      return success(
        {
          workflowDefinitionId: specDefinition.id,
          definitionName: specDefinition.name,
        },
        0,
      );
    },

    workflow_create: async (params, execution) => {
      await requireSystemAgent(context, 'workflow_create', execution);
      const request = parseWorkflowCreateRequest(params);

      const parseResult = parseWorkflowSpec(request.specYaml);
      if (!parseResult.success) {
        return {
          success: false,
          output: { valid: false, errors: parseResult.errors },
          durationMs: 0,
        };
      }

      const projectConfig = await resolveProjectConfig(context, request.projectId);
      let definition = specToWorkflowDefinition(parseResult.data, {
        projectId: request.projectId,
      });

      if (request.name) {
        definition = { ...definition, name: request.name };
      }
      definition = { ...definition, specYaml: request.specYaml };

      const updatedConfig = ProjectConfigSchema.parse({
        ...projectConfig,
        workflow: {
          ...projectConfig.workflow,
          definitions: [
            ...(projectConfig.workflow?.definitions ?? []),
            definition,
          ],
          defaultWorkflowDefinitionId: definition.id,
        },
      });

      if (context.deps.projectStore) {
        await context.deps.projectStore.update(request.projectId, {
          workflow: updatedConfig.workflow,
        });
      }

      return success(
        {
          definitionId: definition.id,
          definitionName: definition.name,
        },
        0,
      );
    },

    workflow_update: async (params, execution) => {
      await requireSystemAgent(context, 'workflow_update', execution);
      const request = parseWorkflowUpdateRequest(params);

      const parseResult = parseWorkflowSpec(request.specYaml);
      if (!parseResult.success) {
        return {
          success: false,
          output: { valid: false, errors: parseResult.errors },
          durationMs: 0,
        };
      }

      const projectConfig = await resolveProjectConfig(context, request.projectId);
      let definition = specToWorkflowDefinition(parseResult.data, {
        definitionId: request.definitionId,
        projectId: request.projectId,
      });

      if (request.name) {
        definition = { ...definition, name: request.name };
      }
      definition = { ...definition, specYaml: request.specYaml };

      const currentDefinitions = projectConfig.workflow?.definitions ?? [];
      const nextDefinitions = currentDefinitions.some(
        (d) => d.id === definition.id,
      )
        ? currentDefinitions.map((d) =>
            d.id === definition.id ? definition : d)
        : [...currentDefinitions, definition];

      const updatedConfig = ProjectConfigSchema.parse({
        ...projectConfig,
        workflow: {
          ...projectConfig.workflow,
          definitions: nextDefinitions,
        },
      });

      if (context.deps.projectStore) {
        await context.deps.projectStore.update(request.projectId, {
          workflow: updatedConfig.workflow,
        });
      }

      return success(
        {
          definitionId: definition.id,
          definitionName: definition.name,
        },
        0,
      );
    },

    workflow_delete: async (params, execution) => {
      await requireSystemAgent(context, 'workflow_delete', execution);
      const request = parseWorkflowDeleteRequest(params);

      const projectConfig = await resolveProjectConfig(context, request.projectId);
      const currentDefinitions = projectConfig.workflow?.definitions ?? [];
      const nextDefinitions = currentDefinitions.filter(
        (d) => d.id !== request.definitionId,
      );

      const deleted = nextDefinitions.length < currentDefinitions.length;

      if (deleted && context.deps.projectStore) {
        const defaultId = projectConfig.workflow?.defaultWorkflowDefinitionId;
        const updatedConfig = ProjectConfigSchema.parse({
          ...projectConfig,
          workflow: {
            ...projectConfig.workflow,
            definitions: nextDefinitions,
            defaultWorkflowDefinitionId:
              defaultId === request.definitionId ? undefined : defaultId,
          },
        });

        await context.deps.projectStore.update(request.projectId, {
          workflow: updatedConfig.workflow,
        });
      }

      return success({ deleted }, 0);
    },
  };
}
