import {
  NousError,
  type AgentClass,
  type CriticalActionCategory,
  type GatewayExecutionContext,
  type ProjectId,
  type ToolResult,
  type TraceEvidenceReference,
  type WitnessActor,
  type WitnessEventId,
} from '@nous/shared';
import {
  parseArtifactRetrieveRequest,
  parseArtifactStoreRequest,
  parseEscalationNotifyRequest,
  parseExternalMemoryCompactCommand,
  parseExternalMemoryDeleteCommand,
  parseExternalMemoryGetQuery,
  parseExternalMemoryPutCommand,
  parseExternalMemorySearchQuery,
  parseMemorySearchRequest,
  parseMemoryWriteRequest,
  parseProjectDiscoverRequest,
  parseSchedulerRegisterRequest,
  parseToolExecuteRequest,
  parseToolListRequest,
  parseWitnessCheckpointRequest,
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
  'dispatch_agent' | 'task_complete' | 'request_escalation' | 'flag_observation'
>;

function requireExternalSourceMemoryService(context: InternalMcpHandlerContext) {
  if (!context.deps.externalSourceMemoryService) {
    throw new NousError(
      'Public external memory service is unavailable',
      'SERVICE_UNAVAILABLE',
    );
  }

  return context.deps.externalSourceMemoryService;
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

      return success(await api.memory.read(request.query, request.scope), 0);
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
        operation: () => service.createCheckpoint(request.reason),
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
  };
}
