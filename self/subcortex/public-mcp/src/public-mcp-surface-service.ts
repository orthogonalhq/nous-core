import { randomUUID } from 'node:crypto';
import type {
  IPublicMcpSurfaceService,
  PublicMcpAgentCatalogEntry,
  PublicMcpAgentInvokeCommand,
  PublicMcpAgentInvokeResult,
  PublicMcpAgentListQuery,
  PublicMcpSystemInfo,
  PublicMcpSystemInfoQuery,
  PublicMcpTaskQuery,
  PublicMcpTaskResult,
} from '@nous/shared';
import {
  NousError,
  PublicMcpAgentCatalogEntrySchema,
  PublicMcpAgentInvokeCompletedSchema,
  PublicMcpAgentInvokeTaskAcceptedSchema,
  PublicMcpSystemInfoSchema,
  PublicMcpTaskResultSchema,
} from '@nous/shared';
import { AuditProjectionStore } from './audit-projection-store.js';
import { PublicMcpTaskProjectionStore } from './public-mcp-task-projection-store.js';

export interface PublicMcpRuntimeInvocationLike {
  requestId: string;
  runId?: string;
  targetClass: 'Worker' | 'Orchestrator';
  taskInstructions: string;
  payload?: unknown;
  runtimeContext?: {
    deploymentMode?: 'local_tunnel' | 'hosted' | 'development';
    tenantId?: string;
    userHandle?: string;
  };
  context?: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
}

export interface PublicMcpRuntimeInvocationResultLike {
  runId: string;
  status: 'completed' | 'failed' | 'blocked';
  output: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface PublicMcpRuntimeAdapterLike {
  runAgent(
    request: PublicMcpRuntimeInvocationLike,
  ): Promise<PublicMcpRuntimeInvocationResultLike>;
}

export interface PublicMcpRuntimeAgentDefinition {
  catalog: PublicMcpAgentCatalogEntry;
  targetClass: 'Worker' | 'Orchestrator';
  buildTaskInstructions: (request: PublicMcpAgentInvokeCommand) => string;
  buildPayload?: (request: PublicMcpAgentInvokeCommand) => unknown;
}

export interface PublicMcpSurfaceServiceOptions {
  runtimeAdapter: PublicMcpRuntimeAdapterLike;
  taskStore: PublicMcpTaskProjectionStore;
  auditStore?: AuditProjectionStore;
  publicAgents: readonly PublicMcpRuntimeAgentDefinition[];
  serverName?: string;
  phase?: string;
  backendMode?: 'local_tunnel' | 'hosted' | 'development';
  featureOverrides?: Partial<PublicMcpSystemInfo['features']>;
  taskToolSupport?: PublicMcpSystemInfo['tasks']['toolSupport'];
  runtimeContext?: PublicMcpRuntimeInvocationLike['runtimeContext'];
  maxInvokeInputBytes?: number;
  maxSearchTopK?: number;
  maxTaskPollWindowSeconds?: number;
  invokePerMinute?: number;
  compactPerMinute?: number;
  now?: () => string;
  idFactory?: () => string;
}

export class PublicMcpSurfaceService implements IPublicMcpSurfaceService {
  private readonly publicAgents: readonly PublicMcpRuntimeAgentDefinition[];
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: PublicMcpSurfaceServiceOptions) {
    this.publicAgents = options.publicAgents.map((agent) => ({
      ...agent,
      catalog: PublicMcpAgentCatalogEntrySchema.parse(agent.catalog),
    }));
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async listAgents(
    _request: PublicMcpAgentListQuery,
  ): Promise<PublicMcpAgentCatalogEntry[]> {
    return this.publicAgents.map((agent) => agent.catalog);
  }

  async invokeAgent(
    request: PublicMcpAgentInvokeCommand,
  ): Promise<PublicMcpAgentInvokeResult> {
    const agent = this.resolveAgent(request.arguments.agentId);
    this.assertMemoryBindingAllowed(agent.catalog, request);

    if (this.shouldRunAsync(agent.catalog, request)) {
      return this.invokeAsync(agent, request);
    }

    const result = await this.options.runtimeAdapter.runAgent({
      requestId: request.requestId,
      targetClass: agent.targetClass,
      taskInstructions: agent.buildTaskInstructions(request),
      payload: agent.buildPayload?.(request),
      runtimeContext: this.options.runtimeContext,
      context: buildRuntimeContext(request),
    });

    if (result.status !== 'completed') {
      throw new NousError(
        result.error?.message ?? 'Public agent invocation failed',
        'TOOL_EXECUTION_FAILED',
        {
          agentId: request.arguments.agentId,
          runId: result.runId,
          status: result.status,
        },
      );
    }

    return PublicMcpAgentInvokeCompletedSchema.parse({
      mode: 'completed',
      runId: result.runId,
      outputs: normalizeOutput(result.output),
    });
  }

  async getTask(request: PublicMcpTaskQuery) {
    return this.options.taskStore.getTask(request.subject, request.taskId);
  }

  async getTaskResult(request: PublicMcpTaskQuery): Promise<PublicMcpTaskResult | null> {
    return this.options.taskStore.getTaskResult(request.subject, request.taskId);
  }

  async getSystemInfo(_request: PublicMcpSystemInfoQuery): Promise<PublicMcpSystemInfo> {
    return PublicMcpSystemInfoSchema.parse({
      server: {
        name: this.options.serverName ?? 'Nous Public MCP',
        phase: this.options.phase ?? 'phase-13.5',
        backendMode: this.options.backendMode ?? 'development',
        protocolVersion: '2025-11-25',
      },
      features: {
        publicAgents: this.options.featureOverrides?.publicAgents ?? true,
        publicSystemInfo: this.options.featureOverrides?.publicSystemInfo ?? true,
        publicTasks: this.options.featureOverrides?.publicTasks ?? true,
        publicCompactAsync: this.options.featureOverrides?.publicCompactAsync ?? true,
      },
      limits: {
        maxInvokeInputBytes: this.options.maxInvokeInputBytes ?? 8192,
        maxSearchTopK: this.options.maxSearchTopK ?? 50,
        maxTaskPollWindowSeconds: this.options.maxTaskPollWindowSeconds ?? 300,
      },
      quotas: {
        invokePerMinute: this.options.invokePerMinute ?? 10,
        compactPerMinute: this.options.compactPerMinute ?? 10,
      },
      tasks: {
        supportedMethods: ['tasks/get', 'tasks/result'],
        toolSupport: this.options.taskToolSupport ?? {
          'ortho.agents.v1.invoke': 'optional',
          'ortho.memory.v1.compact': 'optional',
        },
      },
    });
  }

  private async invokeAsync(
    agent: PublicMcpRuntimeAgentDefinition,
    request: PublicMcpAgentInvokeCommand,
  ): Promise<PublicMcpAgentInvokeResult> {
    const taskId = this.idFactory();
    const runId = this.idFactory();
    const submittedAt = this.now();
    await this.options.taskStore.create({
      taskId,
      toolName: 'ortho.agents.v1.invoke',
      subject: request.subject,
      canonicalRunId: runId,
      status: 'queued',
      submittedAt,
    });
    await this.options.auditStore?.save({
      requestId: taskId,
      timestamp: submittedAt,
      oauthClientId: request.subject.clientId,
      namespace: request.subject.namespace,
      toolName: 'ortho.agents.v1.invoke',
      internalToolName: 'public_agent_invoke',
      outcome: 'admitted',
      latencyMs: 0,
      createdAt: submittedAt,
    });

    queueMicrotask(() => {
      void this.executeAsyncTask(taskId, runId, agent, request);
    });

    return PublicMcpAgentInvokeTaskAcceptedSchema.parse({
      mode: 'task',
      task: {
        taskId,
        status: 'queued',
        runId,
      },
    });
  }

  private async executeAsyncTask(
    taskId: string,
    runId: string,
    agent: PublicMcpRuntimeAgentDefinition,
    request: PublicMcpAgentInvokeCommand,
  ): Promise<void> {
    await this.options.taskStore.markRunning(taskId, this.now());
    const result = await this.options.runtimeAdapter.runAgent({
      requestId: request.requestId,
      runId,
      targetClass: agent.targetClass,
      taskInstructions: agent.buildTaskInstructions(request),
      payload: agent.buildPayload?.(request),
      runtimeContext: this.options.runtimeContext,
      context: buildRuntimeContext(request),
    });

    const completedAt = this.now();
    if (result.status === 'completed') {
      const taskResult = PublicMcpTaskResultSchema.parse({
        taskId,
        status: 'completed',
        result: {
          runId,
          outputs: normalizeOutput(result.output),
        },
      });
      await this.options.taskStore.complete(taskId, taskResult, completedAt);
      await this.options.auditStore?.save({
        requestId: this.idFactory(),
        timestamp: completedAt,
        oauthClientId: request.subject.clientId,
        namespace: request.subject.namespace,
        toolName: 'ortho.agents.v1.invoke',
        internalToolName: 'public_agent_invoke',
        outcome: 'completed',
        latencyMs: 0,
        createdAt: completedAt,
      });
      return;
    }

    const taskResult = PublicMcpTaskResultSchema.parse({
      taskId,
      status: result.status === 'blocked' ? 'blocked' : 'failed',
      error: {
        code: result.error?.code ?? result.status,
        message: result.error?.message ?? 'Public agent invocation failed',
      },
    });
    await this.options.taskStore.complete(taskId, taskResult, completedAt);
    await this.options.auditStore?.save({
      requestId: this.idFactory(),
      timestamp: completedAt,
      oauthClientId: request.subject.clientId,
      namespace: request.subject.namespace,
      toolName: 'ortho.agents.v1.invoke',
      internalToolName: 'public_agent_invoke',
      outcome: 'blocked',
      rejectReason: 'tool_not_available',
      latencyMs: 0,
      createdAt: completedAt,
    });
  }

  private resolveAgent(agentId: string): PublicMcpRuntimeAgentDefinition {
    const agent = this.publicAgents.find((entry) => entry.catalog.agentId === agentId);
    if (!agent) {
      throw new NousError(
        `Public agent ${agentId} is not available`,
        'AGENT_NOT_AVAILABLE',
      );
    }
    return agent;
  }

  private assertMemoryBindingAllowed(
    agent: PublicMcpAgentCatalogEntry,
    request: PublicMcpAgentInvokeCommand,
  ): void {
    const binding = request.arguments.memory;
    if (!binding) {
      return;
    }
    if (!agent.memoryBinding.supported) {
      throw new NousError(
        `Public agent ${agent.agentId} does not accept memory bindings`,
        'MEMORY_BINDING_FORBIDDEN',
      );
    }
    if (binding.namespace && binding.namespace !== request.subject.namespace) {
      throw new NousError(
        'Requested memory binding namespace is not authorized for this subject',
        'NAMESPACE_UNAUTHORIZED',
      );
    }
    if (binding.readTiers.some((tier) => !agent.memoryBinding.readTiers.includes(tier))) {
      throw new NousError(
        'Requested read tiers are not allowed for this public agent',
        'MEMORY_BINDING_FORBIDDEN',
      );
    }
    if (binding.writeTiers.some((tier) => !agent.memoryBinding.writeTiers.includes(tier))) {
      throw new NousError(
        'Requested write tiers are not allowed for this public agent',
        'MEMORY_BINDING_FORBIDDEN',
      );
    }
  }

  private shouldRunAsync(
    agent: PublicMcpAgentCatalogEntry,
    request: PublicMcpAgentInvokeCommand,
  ): boolean {
    if (agent.execution.taskSupport === 'required') {
      return true;
    }
    if (request.arguments.executionMode === 'async') {
      return true;
    }
    if (request.arguments.executionMode === 'sync') {
      return false;
    }
    if (agent.execution.asyncThreshold === 'always_async') {
      return true;
    }
    if (agent.execution.asyncThreshold === 'never') {
      return false;
    }

    return estimateInvokeInputBytes(request) > 512;
  }
}

function buildRuntimeContext(request: PublicMcpAgentInvokeCommand) {
  const frames: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: `Authenticated public subject namespace: ${request.subject.namespace}`,
    },
  ];
  if (request.arguments.memory) {
    frames.push({
      role: 'system',
      content: `Authorized memory binding: ${JSON.stringify(request.arguments.memory)}`,
    });
  }
  return frames;
}

function normalizeOutput(output: unknown) {
  if (typeof output === 'string') {
    return [{ type: 'text' as const, text: output }];
  }
  if (
    typeof output === 'object' &&
    output != null &&
    'response' in output &&
    typeof (output as { response?: unknown }).response === 'string'
  ) {
    return [{ type: 'text' as const, text: (output as { response: string }).response }];
  }
  return [
    {
      type: 'json' as const,
      payload:
        typeof output === 'object' && output != null
          ? (output as Record<string, unknown>)
          : { value: output },
    },
  ];
}

function estimateInvokeInputBytes(request: PublicMcpAgentInvokeCommand): number {
  return Buffer.byteLength(JSON.stringify(request.arguments.input), 'utf8');
}
