import { randomUUID } from 'node:crypto';
import type {
  AgentGatewayConfig,
  AgentResult,
  GatewayBudget,
  IAgentGatewayFactory,
  IModelProvider,
  IModelRouter,
  PublicMcpDeploymentMode,
  ModelRequirements,
  ProjectId,
  ProviderId,
  TraceEvidenceReference,
} from '@nous/shared';
import { AgentGatewayFactory } from '../agent-gateway/index.js';
import { createInternalMcpSurfaceBundle } from '../internal-mcp/index.js';
import type { InternalMcpRuntimeDeps } from '../internal-mcp/types.js';
import { parseModelOutput } from '../output-parser.js';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../prompts/index.js';

const DEFAULT_PUBLIC_AGENT_BUDGET: GatewayBudget = {
  maxTurns: 4,
  maxTokens: 1400,
  timeoutMs: 120_000,
};

const DEFAULT_WORKER_PROMPT = [
  'You are Worker.',
  'You execute assigned work through the canonical AgentGateway runtime.',
  'Finish every run by calling task_complete.',
].join('\n');

export interface PublicMcpRuntimeInvocation {
  requestId: string;
  runId?: string;
  projectId?: ProjectId;
  traceId?: string;
  targetClass: 'Worker' | 'Orchestrator';
  taskInstructions: string;
  payload?: unknown;
  context?: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  runtimeContext?: {
    deploymentMode?: PublicMcpDeploymentMode;
    tenantId?: string;
    userHandle?: string;
  };
  modelRequirements?: ModelRequirements;
}

export interface PublicMcpRuntimeInvocationResult {
  runId: string;
  status: 'completed' | 'failed' | 'blocked';
  output: unknown;
  error?: {
    code: string;
    message: string;
  };
  evidenceRefs: TraceEvidenceReference[];
}

export interface PublicMcpRuntimeAdapterDeps extends InternalMcpRuntimeDeps {
  modelRouter: IModelRouter;
  getProvider: (providerId: ProviderId) => IModelProvider | null;
  agentGatewayFactory?: IAgentGatewayFactory;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
}

export class PublicMcpRuntimeAdapter {
  private readonly gatewayFactory: IAgentGatewayFactory;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly deps: PublicMcpRuntimeAdapterDeps) {
    this.gatewayFactory = deps.agentGatewayFactory ?? new AgentGatewayFactory();
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async runAgent(
    request: PublicMcpRuntimeInvocation,
  ): Promise<PublicMcpRuntimeInvocationResult> {
    const runId = request.runId ?? this.idFactory();
    const agentId = this.idFactory() as AgentGatewayConfig['agentId'];
    const bundle = createInternalMcpSurfaceBundle({
      agentClass: request.targetClass,
      agentId,
      deps: {
        ...this.deps,
        workmodeAdmissionGuard: this.deps.workmodeAdmissionGuard,
        now: this.now,
        nowMs: this.deps.nowMs,
        idFactory: this.idFactory,
      },
    });
    const gateway = this.gatewayFactory.create({
      agentClass: request.targetClass,
      agentId,
      toolSurface: bundle.toolSurface,
      lifecycleHooks: bundle.lifecycleHooks,
      baseSystemPrompt:
        request.targetClass === 'Orchestrator'
          ? ORCHESTRATOR_SYSTEM_PROMPT
          : DEFAULT_WORKER_PROMPT,
      modelRouter: this.deps.modelRouter,
      getProvider: (providerId) =>
        this.wrapProvider(this.deps.getProvider(providerId as ProviderId)),
      witnessService: this.deps.witnessService,
      now: this.now,
      nowMs: this.deps.nowMs,
      idFactory: this.idFactory,
    });

    const result = await gateway.run({
      taskInstructions: request.taskInstructions,
      payload: request.payload,
      context: [
        ...buildRuntimeContextPrelude(request.runtimeContext),
        ...(request.context ?? []).map((frame) => ({
          role: frame.role,
          source: 'initial_context' as const,
          content: frame.content,
          createdAt: this.now(),
        })),
      ],
      budget: DEFAULT_PUBLIC_AGENT_BUDGET,
      spawnBudgetCeiling: request.targetClass === 'Orchestrator' ? 8 : 0,
      correlation: {
        runId: runId as never,
        parentId: gateway.agentId,
        sequence: 0,
      },
      execution: {
        projectId: request.projectId,
        traceId: (request.traceId ?? request.requestId) as never,
        workmodeId: 'system:implementation',
      },
      modelRequirements: request.modelRequirements,
    });

    return this.normalizeResult(runId, result);
  }

  private wrapProvider(provider: IModelProvider | null): IModelProvider | null {
    if (!provider) {
      return null;
    }

    return {
      ...provider,
      invoke: async (request) => {
        const response = await provider.invoke(request);
        const parsedOutput = parseModelOutput(
          response.output,
          response.traceId,
          '',
        );
        if (parsedOutput.toolCalls.some((toolCall) => toolCall.name === 'task_complete')) {
          return response;
        }

        return {
          ...response,
          output: JSON.stringify({
            response: '',
            toolCalls: [
              {
                name: 'task_complete',
                params: {
                  output: { response: parsedOutput.response.trim() || String(response.output ?? '') },
                  summary: 'public agent run completed',
                },
              },
            ],
            memoryCandidates: [],
          }),
        };
      },
      stream: provider.stream.bind(provider),
    };
  }

  private normalizeResult(
    runId: string,
    result: AgentResult,
  ): PublicMcpRuntimeInvocationResult {
    if (result.status === 'completed') {
      return {
        runId,
        status: 'completed',
        output: result.output,
        evidenceRefs: result.evidenceRefs,
      };
    }

    return {
      runId,
      status: result.status === 'escalated' ? 'blocked' : 'failed',
      output: result.status === 'escalated' ? result.detail : result,
      error: {
        code: result.status,
        message:
          'reason' in result && typeof result.reason === 'string'
            ? result.reason
            : `Public agent run ended with status ${result.status}`,
      },
      evidenceRefs: result.evidenceRefs,
    };
  }
}

function buildRuntimeContextPrelude(
  runtimeContext?: PublicMcpRuntimeInvocation['runtimeContext'],
) {
  if (!runtimeContext) {
    return [];
  }

  const lines = [
    runtimeContext.deploymentMode
      ? `Public deployment mode: ${runtimeContext.deploymentMode}`
      : undefined,
    runtimeContext.tenantId
      ? `Hosted tenant: ${runtimeContext.tenantId}`
      : undefined,
    runtimeContext.userHandle
      ? `Resolved user handle: ${runtimeContext.userHandle}`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  if (lines.length === 0) {
    return [];
  }

  return [
    {
      role: 'system' as const,
      source: 'initial_context' as const,
      content: lines.join('\n'),
      createdAt: new Date().toISOString(),
    },
  ];
}
