import { randomUUID } from 'node:crypto';
import {
  NousError,
  ValidationError,
  GatewayStampedPacketSchema,
  type AgentClass,
  type AgentGatewayConfig,
  type DispatchOrchestratorRequest,
  type DispatchWorkerRequest,
  type EscalationContract,
  type GatewayBudget,
  type GatewayLifecycleContext,
  type GatewayStampedPacket,
  type GatewayTaskCompletionHookResult,
  type ProjectId,
  type TraceEvidenceReference,
  type WitnessActor,
  type WitnessEventId,
  type WorkflowNodeDefinition,
} from '@nous/shared';
import { getAuthorizedInternalMcpTools } from './authorization-matrix.js';
import { createScopedMcpToolSurface } from './scoped-tool-surface.js';
import {
  INTERNAL_MCP_TOOL_NAMES,
} from './types.js';
import type {
  InternalMcpGraphResolution,
  InternalMcpHandlerContext,
  InternalMcpRuntimeDeps,
  InternalMcpSurfaceBundle,
  InternalMcpTaskCompletionPacketArgs,
} from './types.js';

const DEFAULT_CHILD_BUDGET: GatewayBudget = {
  maxTurns: 3,
  maxTokens: 600,
  timeoutMs: 60_000,
};

const WITNESS_ACTOR_BY_CLASS: Record<AgentClass, WitnessActor> = {
  'Cortex::Principal': 'principal',
  'Cortex::System': 'system',
  Orchestrator: 'orchestration_agent',
  Worker: 'worker_agent',
};

function authorityActorForClass(agentClass: AgentClass) {
  switch (agentClass) {
    case 'Cortex::System':
    case 'Cortex::Principal':
      return 'nous_cortex';
    case 'Orchestrator':
      return 'orchestration_agent';
    case 'Worker':
      return 'worker_agent';
  }
}

function buildChildBudget(
  deps: InternalMcpRuntimeDeps,
  request: { budget?: Partial<GatewayBudget> },
): GatewayBudget {
  if (deps.dispatchRuntime?.buildChildBudget) {
    return deps.dispatchRuntime.buildChildBudget(request);
  }

  return {
    maxTurns: request.budget?.maxTurns ?? DEFAULT_CHILD_BUDGET.maxTurns,
    maxTokens: request.budget?.maxTokens ?? DEFAULT_CHILD_BUDGET.maxTokens,
    timeoutMs: request.budget?.timeoutMs ?? DEFAULT_CHILD_BUDGET.timeoutMs,
  };
}

async function executeWithWitness<T>(args: {
  context: InternalMcpHandlerContext;
  lifecycleContext: GatewayLifecycleContext;
  actionRef: string;
  projectId?: ProjectId;
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
    actionCategory: 'trace-persist',
    actionRef: args.actionRef,
    actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
    status: 'approved',
    detail: args.detail,
    projectId: args.projectId,
    traceId: args.lifecycleContext.execution?.traceId,
  });

  try {
    const value = await args.operation();
    const completion = await service.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: args.actionRef,
      authorizationRef: authorization.id,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'succeeded',
      detail: args.detail,
      projectId: args.projectId,
      traceId: args.lifecycleContext.execution?.traceId,
    });

    return {
      value,
      authorizationEventId: authorization.id,
      completionEventId: completion.id,
      evidenceRef: {
        actionCategory: 'trace-persist',
        authorizationEventId: authorization.id,
        completionEventId: completion.id,
      },
    };
  } catch (error) {
    await service.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: args.actionRef,
      authorizationRef: authorization.id,
      actor: WITNESS_ACTOR_BY_CLASS[args.context.agentClass],
      status: 'failed',
      detail: {
        ...args.detail,
        error: error instanceof Error ? error.message : String(error),
      },
      projectId: args.projectId,
      traceId: args.lifecycleContext.execution?.traceId,
    });
    throw error;
  }
}

function buildTaskCompletionPacket(
  args: InternalMcpTaskCompletionPacketArgs,
): GatewayStampedPacket {
  const agentScope = args.agentClass.replaceAll('::', '-').toLowerCase();
  const nodeScope = args.context.execution?.nodeDefinitionId ?? 'standalone';
  const parentScope = args.context.correlation.parentId ?? 'terminal';
  const packet = {
    nous: { v: 3 },
    route: {
      emitter: {
        id: `internal-mcp::${agentScope}::node-${nodeScope}::task-complete`,
      },
      target: {
        id: `internal-mcp::parent::run-${parentScope}::receive-task-complete`,
      },
    },
    envelope: {
      direction: 'internal',
      type: 'response_packet',
    },
    correlation: {
      handoff_id: args.handoffId,
      correlation_id: args.context.correlation.runId,
      cycle: 'n/a',
      sequence_in_run: String(args.context.correlation.sequence + 1),
      emitted_at_utc: args.emittedAt,
      emitted_at_unix_ms: String(args.emittedAtMs),
      emitted_at_unix_us: String(args.emittedAtMs * 1000),
    },
    payload: {
      schema: args.payloadSchemaRef,
      artifact_type: args.artifactType,
      data: args.request.output,
    },
    retry: {
      policy: 'value-proportional',
      depth: 'lightweight',
      importance_tier: 'standard',
      expected_quality_gain: 'n/a',
      estimated_tokens: 'n/a',
      estimated_compute_minutes: 'n/a',
      token_price_ref: 'runtime:gateway',
      compute_price_ref: 'runtime:gateway',
      decision: 'accept',
      decision_log_ref: 'runtime:gateway/task-complete',
      benchmark_tier: 'n/a',
      self_repair: {
        required_on_fail_close: true,
        orchestration_state: 'deferred',
        approval_role: 'Cortex:System',
        implementation_mode: 'direct',
        plan_ref: 'runtime:gateway/self-repair',
      },
    },
    artifact_refs: args.request.artifactRefs ?? [],
    summary: args.request.summary,
    emitter_agent_class: args.agentClass,
  };

  return GatewayStampedPacketSchema.parse(packet);
}

function resolveNodeIoContract(node: WorkflowNodeDefinition): {
  inputSchemaRef?: string;
  outputSchemaRef?: string;
} {
  return {
    inputSchemaRef: node.inputSchemaRef,
    outputSchemaRef:
      node.outputSchemaRef ??
      (node.config.type === 'model-call'
        ? node.config.outputSchemaRef
        : node.config.type === 'tool-execution'
          ? node.config.resultSchemaRef
          : undefined),
  };
}

function resolveNodeSchemaRef(node: WorkflowNodeDefinition): string | null {
  return resolveNodeIoContract(node).outputSchemaRef ?? null;
}

async function resolveGraphSchemaRef(args: {
  deps: InternalMcpRuntimeDeps;
  lifecycleContext: GatewayLifecycleContext;
}): Promise<InternalMcpGraphResolution | null> {
  const executionId = args.lifecycleContext.execution?.executionId;
  const nodeDefinitionId = args.lifecycleContext.execution?.nodeDefinitionId;

  if (!executionId && !nodeDefinitionId) {
    return null;
  }

  if (!executionId || !nodeDefinitionId) {
    throw new ValidationError('Partial workflow execution context is invalid', [
      {
        path: 'execution',
        message: 'executionId and nodeDefinitionId must both be present',
      },
    ]);
  }

  const graph = await args.deps.workflowEngine?.getRunGraph(executionId);
  if (!graph) {
    throw new ValidationError('Workflow graph is unavailable for task_complete', [
      {
        path: 'execution.executionId',
        message: 'workflow graph not found',
      },
    ]);
  }

  const node = graph.nodes[nodeDefinitionId]?.definition;
  if (!node) {
    throw new ValidationError('Workflow node is unavailable for task_complete', [
      {
        path: 'execution.nodeDefinitionId',
        message: 'workflow node not found',
      },
    ]);
  }

  const schemaRef = resolveNodeSchemaRef(node);
  if (!schemaRef) {
    throw new ValidationError('Workflow completion requires an explicit output schema', [
      {
        path: 'execution.nodeDefinitionId',
        message: 'workflow node does not expose outputSchemaRef/resultSchemaRef',
      },
    ]);
  }

  return {
    schemaRef,
    nodeDefinition: node,
  };
}

async function resolveDispatchTargetNode(args: {
  deps: InternalMcpRuntimeDeps;
  lifecycleContext: GatewayLifecycleContext;
  nodeDefinitionId?: string;
}): Promise<WorkflowNodeDefinition | null> {
  const executionId = args.lifecycleContext.execution?.executionId;
  if (!executionId && !args.nodeDefinitionId) {
    return null;
  }

  if (!executionId || !args.nodeDefinitionId) {
    throw new ValidationError('Partial workflow execution context is invalid', [
      {
        path: 'execution',
        message: 'executionId and nodeDefinitionId must both be present',
      },
    ]);
  }

  const graph = await args.deps.workflowEngine?.getRunGraph(executionId);
  if (!graph) {
    throw new ValidationError('Workflow graph is unavailable for dispatch_worker', [
      {
        path: 'execution.executionId',
        message: 'workflow graph not found',
      },
    ]);
  }

  const node = graph.nodes[args.nodeDefinitionId]?.definition;
  if (!node) {
    throw new ValidationError('Workflow node is unavailable for dispatch_worker', [
      {
        path: 'request.nodeDefinitionId',
        message: 'workflow node not found',
      },
    ]);
  }

  return node;
}

async function validateNodeSchemaValue(args: {
  deps: InternalMcpRuntimeDeps;
  projectId?: ProjectId;
  schemaRef: string;
  value: unknown;
  path: string;
  message: string;
}) {
  const validator = args.deps.outputSchemaValidator;
  if (!validator) {
    throw new ValidationError('Output schema validator is not configured', [
      {
        path: args.path,
        message: `validator missing for schema ${args.schemaRef}`,
      },
    ]);
  }

  const result = await validator.validate(args.schemaRef, args.value, args.projectId);
  if (!result.success) {
    throw new ValidationError(
      args.message,
      result.issues.map((issue, index) => ({
        path: `${args.path}.${index}`,
        message: issue,
      })),
    );
  }
}

async function validateTaskCompletionOutput(args: {
  deps: InternalMcpRuntimeDeps;
  projectId?: ProjectId;
  schemaRef: string;
  output: unknown;
}) {
  await validateNodeSchemaValue({
    deps: args.deps,
    projectId: args.projectId,
    schemaRef: args.schemaRef,
    value: args.output,
    path: 'output',
    message: 'Task completion output failed schema validation',
  });
}

const VALID_TOOL_NAME_SET = new Set<string>(INTERNAL_MCP_TOOL_NAMES);

function validateGrantedTools(
  grantedTools: string[] | undefined,
  dispatcherAgentClass: AgentClass,
  dispatcherEffectiveGrants: ReadonlySet<string>,
): void {
  if (!grantedTools || grantedTools.length === 0) {
    return;
  }

  // Two-hop ceiling: Workers cannot sub-delegate
  if (dispatcherAgentClass === 'Worker') {
    throw new NousError(
      'Worker agents cannot delegate granted_tools (two-hop ceiling)',
      'DISPATCH_ADMISSION_DENIED',
      { evidenceRefs: ['two-hop-ceiling: Worker cannot sub-delegate'] },
    );
  }

  // Tool name validity
  const invalidNames = grantedTools.filter((name) => !VALID_TOOL_NAME_SET.has(name));
  if (invalidNames.length > 0) {
    throw new NousError(
      `granted_tools contains invalid tool names: ${invalidNames.join(', ')}`,
      'DISPATCH_ADMISSION_DENIED',
      { evidenceRefs: invalidNames.map((n) => `invalid-tool-name: ${n}`) },
    );
  }

  // Subset constraint: dispatcher can only grant tools it possesses
  const unpossessed = grantedTools.filter((name) => !dispatcherEffectiveGrants.has(name));
  if (unpossessed.length > 0) {
    throw new NousError(
      `granted_tools contains tools not possessed by the dispatcher: ${unpossessed.join(', ')}`,
      'DISPATCH_ADMISSION_DENIED',
      { evidenceRefs: unpossessed.map((n) => `unpossessed-tool: ${n}`) },
    );
  }
}

export function createLifecycleHandlers(options: {
  agentClass: AgentClass;
  agentId: AgentGatewayConfig['agentId'];
  deps: InternalMcpRuntimeDeps;
  lease?: import('@nous/shared').LeaseContract;
}): NonNullable<AgentGatewayConfig['lifecycleHooks']> {
  const baselineToolSet = getAuthorizedInternalMcpTools(options.agentClass);
  const leaseGrants = options.lease?.granted_tools ?? [];
  const toolSet: ReadonlySet<string> = leaseGrants.length > 0
    ? new Set([...baselineToolSet, ...leaseGrants])
    : baselineToolSet;
  const handlerContext: InternalMcpHandlerContext = {
    agentClass: options.agentClass,
    agentId: options.agentId,
    deps: options.deps,
  };

  return {
    dispatchOrchestrator: toolSet.has('dispatch_orchestrator')
      ? async (request: DispatchOrchestratorRequest, lifecycleContext) => {
          const runtime = options.deps.dispatchRuntime;
          if (!runtime) {
            throw new NousError(
              'dispatch_orchestrator requires a dispatch runtime',
              'SERVICE_UNAVAILABLE',
            );
          }

          const admission = options.deps.workmodeAdmissionGuard.evaluateDispatchAdmission({
            sourceActor: authorityActorForClass(options.agentClass),
            targetActor: 'orchestration_agent',
            action: 'dispatch_orchestrator',
            projectRunId: lifecycleContext.execution?.executionId,
            workmodeId: lifecycleContext.execution?.workmodeId,
          });

          if (!admission.allowed) {
            throw new NousError(
              admission.reasonCode,
              'DISPATCH_ADMISSION_DENIED',
              { evidenceRefs: admission.evidenceRefs },
            );
          }

          const scopeGuard = options.deps.workmodeAdmissionGuard.evaluateScopeGuard?.({
            sourceActor: authorityActorForClass(options.agentClass),
            targetActor: 'orchestration_agent',
            action: 'dispatch_orchestrator',
            projectRunId: lifecycleContext.execution?.executionId,
            workmodeId: lifecycleContext.execution?.workmodeId,
            executionContext: lifecycleContext.execution
              ? {
                  workmodeId: lifecycleContext.execution.workmodeId,
                  agentClass: options.agentClass,
                  nodeDefinitionId: lifecycleContext.execution.nodeDefinitionId,
                }
              : undefined,
          });

          if (scopeGuard && !scopeGuard.allowed) {
            throw new NousError(
              scopeGuard.reasonCode,
              'DISPATCH_ADMISSION_DENIED',
              { evidenceRefs: scopeGuard.evidenceRefs },
            );
          }

          const grantedTools = (request as { granted_tools?: string[] }).granted_tools;
          validateGrantedTools(grantedTools, options.agentClass, toolSet);

          const childBudget = buildChildBudget(options.deps, request);
          const dispatched = await executeWithWitness({
            context: handlerContext,
            lifecycleContext,
            actionRef: 'dispatch_orchestrator',
            projectId: lifecycleContext.execution?.projectId,
            detail: {
              targetClass: 'Orchestrator',
              childBudget,
              dispatchIntent: request.dispatchIntent,
              granted_tools: grantedTools,
            },
            operation: () =>
              runtime.dispatchChild({
                request: {
                  targetClass: 'Orchestrator',
                  taskInstructions: request.taskInstructions,
                  dispatchIntent: request.dispatchIntent,
                  granted_tools: grantedTools,
                },
                context: lifecycleContext,
                budget: childBudget,
              }),
          });

          return {
            ...dispatched.value,
            evidenceRefs: [
              ...dispatched.value.evidenceRefs,
              ...(dispatched.evidenceRef ? [dispatched.evidenceRef] : []),
            ],
          };
        }
      : undefined,
    dispatchWorker: toolSet.has('dispatch_worker')
      ? async (request: DispatchWorkerRequest, lifecycleContext) => {
          const runtime = options.deps.dispatchRuntime;
          if (!runtime) {
            throw new NousError(
              'dispatch_worker requires a dispatch runtime',
              'SERVICE_UNAVAILABLE',
            );
          }

          const admission = options.deps.workmodeAdmissionGuard.evaluateDispatchAdmission({
            sourceActor: authorityActorForClass(options.agentClass),
            targetActor: 'worker_agent',
            action: 'dispatch_worker',
            projectRunId: lifecycleContext.execution?.executionId,
            workmodeId: lifecycleContext.execution?.workmodeId,
          });

          if (!admission.allowed) {
            throw new NousError(
              admission.reasonCode,
              'DISPATCH_ADMISSION_DENIED',
              { evidenceRefs: admission.evidenceRefs },
            );
          }

          const scopeGuard = options.deps.workmodeAdmissionGuard.evaluateScopeGuard?.({
            sourceActor: authorityActorForClass(options.agentClass),
            targetActor: 'worker_agent',
            action: 'dispatch_worker',
            projectRunId: lifecycleContext.execution?.executionId,
            workmodeId: lifecycleContext.execution?.workmodeId,
            executionContext: lifecycleContext.execution
              ? {
                  workmodeId: lifecycleContext.execution.workmodeId,
                  agentClass: options.agentClass,
                  nodeDefinitionId: lifecycleContext.execution.nodeDefinitionId,
                }
              : undefined,
          });

          if (scopeGuard && !scopeGuard.allowed) {
            throw new NousError(
              scopeGuard.reasonCode,
              'DISPATCH_ADMISSION_DENIED',
              { evidenceRefs: scopeGuard.evidenceRefs },
            );
          }

          const workerGrantedTools = (request as { granted_tools?: string[] }).granted_tools;
          validateGrantedTools(workerGrantedTools, options.agentClass, toolSet);

          const targetNode = await resolveDispatchTargetNode({
            deps: options.deps,
            lifecycleContext,
            nodeDefinitionId: request.nodeDefinitionId,
          });
          const targetIo = targetNode ? resolveNodeIoContract(targetNode) : null;
          if (targetIo?.inputSchemaRef) {
            await validateNodeSchemaValue({
              deps: options.deps,
              projectId: lifecycleContext.execution?.projectId,
              schemaRef: targetIo.inputSchemaRef,
              value: request.payload,
              path: 'payload',
              message: 'Dispatch payload failed schema validation',
            });
          }

          const childBudget = buildChildBudget(options.deps, request);
          const dispatched = await executeWithWitness({
            context: handlerContext,
            lifecycleContext,
            actionRef: 'dispatch_worker',
            projectId: lifecycleContext.execution?.projectId,
            detail: {
              targetClass: 'Worker',
              childBudget,
              nodeDefinitionId: request.nodeDefinitionId,
              granted_tools: workerGrantedTools,
            },
            operation: () =>
              runtime.dispatchChild({
                request: {
                  targetClass: 'Worker',
                  taskInstructions: request.taskInstructions,
                  payload: request.payload,
                  nodeDefinitionId: request.nodeDefinitionId,
                  granted_tools: workerGrantedTools,
                },
                context: lifecycleContext,
                budget: childBudget,
              }),
          });

          return {
            ...dispatched.value,
            evidenceRefs: [
              ...dispatched.value.evidenceRefs,
              ...(dispatched.evidenceRef ? [dispatched.evidenceRef] : []),
            ],
          };
        }
      : undefined,
    taskComplete: toolSet.has('task_complete')
      ? async (request, lifecycleContext): Promise<GatewayTaskCompletionHookResult> => {
          const graphResolution = await resolveGraphSchemaRef({
            deps: options.deps,
            lifecycleContext,
          });
          const projectId = lifecycleContext.execution?.projectId;

          if (graphResolution) {
            await validateTaskCompletionOutput({
              deps: options.deps,
              projectId,
              schemaRef: graphResolution.schemaRef,
              output: request.output,
            });
          }

          const emittedAt = options.deps.now?.() ?? new Date().toISOString();
          const emittedAtMs = options.deps.nowMs?.() ?? Date.now();
          const packet = buildTaskCompletionPacket({
            agentClass: options.agentClass,
            agentId: options.agentId,
            context: lifecycleContext,
            request,
            payloadSchemaRef: graphResolution?.schemaRef ?? 'n/a',
            artifactType: graphResolution?.nodeDefinition.type ?? 'n/a',
            emittedAt,
            emittedAtMs,
            handoffId: (options.deps.idFactory ?? randomUUID)(),
          });

          const completed = await executeWithWitness({
            context: handlerContext,
            lifecycleContext,
            actionRef: 'task_complete',
            projectId,
            detail: {
              summary: request.summary,
              artifactRefs: request.artifactRefs,
              nodeDefinitionId: lifecycleContext.execution?.nodeDefinitionId,
            },
            operation: async () => {
              if (
                lifecycleContext.execution?.executionId &&
                lifecycleContext.execution?.nodeDefinitionId
              ) {
                await options.deps.workflowEngine?.completeNode(
                  lifecycleContext.execution.executionId,
                  lifecycleContext.execution.nodeDefinitionId,
                  {
                    reasonCode: 'gateway_task_complete',
                    evidenceRefs: [],
                    occurredAt: emittedAt,
                  },
                );
              }

              return packet;
            },
          });

          return {
            output: request.output,
            v3Packet: completed.value,
            summary: request.summary,
            artifactRefs: request.artifactRefs,
            evidenceRefs: completed.evidenceRef ? [completed.evidenceRef] : [],
          };
        }
      : undefined,
    requestEscalation: toolSet.has('request_escalation')
      ? async (request, lifecycleContext) => {
          await executeWithWitness({
            context: handlerContext,
            lifecycleContext,
            actionRef: 'request_escalation',
            projectId: lifecycleContext.execution?.projectId,
            detail: {
              severity: request.severity,
              reason: request.reason,
            },
            operation: async () => {
              // Circuit-breaker: prevent re-escalation from escalation-originated tasks
              if (lifecycleContext.execution?.escalationOrigin) {
                return;
              }

              const escalationService = options.deps.escalationService;
              if (!escalationService) {
                options.deps.addHealthIssue?.('escalation_service_unavailable');
                return;
              }

              const projectId = lifecycleContext.execution?.projectId;
              if (!projectId) {
                options.deps.addHealthIssue?.('escalation_bridge_no_project');
                return;
              }

              const contract: EscalationContract = {
                context: request.reason,
                triggerReason: request.reason,
                requiredAction: request.reason,
                channel: 'in-app',
                projectId: projectId as ProjectId,
                priority: request.severity,
                timestamp: (options.deps.now?.() ?? new Date().toISOString()),
              };

              await escalationService.notify(contract);
            },
          });
        }
      : undefined,
    flagObservation: toolSet.has('flag_observation')
      ? async (observation, lifecycleContext) => {
          await executeWithWitness({
            context: handlerContext,
            lifecycleContext,
            actionRef: 'flag_observation',
            projectId: lifecycleContext.execution?.projectId,
            detail: {
              observationType: observation.observationType,
            },
            operation: async () => {
              options.deps.addHealthIssue?.(`observation_${observation.observationType}`);
            },
          });
        }
      : undefined,
  };
}

export function createInternalMcpSurfaceBundle(options: {
  agentClass: AgentClass;
  agentId: AgentGatewayConfig['agentId'];
  deps: InternalMcpRuntimeDeps;
  lease?: import('@nous/shared').LeaseContract;
}): InternalMcpSurfaceBundle {
  return {
    toolSurface: createScopedMcpToolSurface({
      agentClass: options.agentClass,
      agentId: options.agentId,
      deps: options.deps,
      lease: options.lease,
    }),
    lifecycleHooks: createLifecycleHandlers(options),
  };
}
