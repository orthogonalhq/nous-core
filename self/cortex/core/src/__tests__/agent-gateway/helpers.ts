import { vi } from 'vitest';
import type {
  AgentGatewayConfig,
  AgentInput,
  GatewayContextFrame,
  IDocumentStore,
  IModelProvider,
  IScopedMcpToolSurface,
  ToolDefinition,
  ToolResult,
} from '@nous/shared';
import { AgentGateway } from '../../agent-gateway/agent-gateway.js';
import { InMemoryGatewayOutboxSink } from '../../agent-gateway/outbox.js';

export const AGENT_ID = '550e8400-e29b-41d4-a716-446655440100' as AgentGatewayConfig['agentId'];
export const PARENT_ID = '550e8400-e29b-41d4-a716-446655440101' as AgentGatewayConfig['agentId'];
export const RUN_ID = '550e8400-e29b-41d4-a716-446655440102' as AgentInput['correlation']['runId'];
export const TRACE_ID =
  '550e8400-e29b-41d4-a716-446655440103' as NonNullable<
    AgentInput['execution']
  >['traceId'];
export const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440104' as NonNullable<AgentInput['execution']>['projectId'];
export const PROVIDER_ID = '550e8400-e29b-41d4-a716-446655440105' as ReturnType<IModelProvider['getConfig']>['id'];
export const NOW = '2026-03-12T19:00:00.000Z';

export const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: 'lookup_status',
    version: '1.0.0',
    description: 'Lookup task status.',
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
  },
];

export function createDocumentStore(): IDocumentStore {
  const rows = new Map<string, unknown>();
  return {
    put: vi.fn().mockImplementation(async (_collection, id, value) => {
      rows.set(id, value);
    }),
    get: vi.fn().mockImplementation(async (_collection, id) => rows.get(id) ?? null),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
}

export function createToolSurface(
  executeTool?: (name: string, params: unknown) => Promise<ToolResult>,
  tools: ToolDefinition[] = DEFAULT_TOOLS,
): IScopedMcpToolSurface {
  return {
    listTools: vi.fn().mockResolvedValue(tools),
    executeTool: vi.fn().mockImplementation(async (name, params) => {
      if (executeTool) {
        return executeTool(name, params);
      }

      return {
        success: true,
        output: {
          tool: name,
          params,
        },
        durationMs: 5,
      };
    }),
  };
}

export function createModelProvider(
  outputs: unknown[],
  usage: { inputTokens?: number; outputTokens?: number } = {
    inputTokens: 12,
    outputTokens: 8,
  },
): IModelProvider {
  let index = 0;
  const safeOutputs = outputs.length > 0 ? outputs : [''];
  return {
    invoke: vi.fn().mockImplementation(async () => {
      const output = safeOutputs[Math.min(index, safeOutputs.length - 1)];
      index += 1;
      return {
        output,
        providerId: PROVIDER_ID,
        usage,
        traceId: TRACE_ID,
      };
    }),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      id: PROVIDER_ID,
      name: 'test-provider',
      type: 'text',
      modelId: 'test-model',
      isLocal: true,
      capabilities: ['reasoning'],
    }),
  };
}

export function createBaseInput(
  overrides: Partial<AgentInput> = {},
): AgentInput {
  return {
    taskInstructions: 'Complete the assigned task.',
    payload: {
      item: 'phase-12.1',
    },
    context: [],
    budget: {
      maxTurns: 3,
      maxTokens: 200,
      timeoutMs: 1000,
    },
    spawnBudgetCeiling: 10,
    correlation: {
      runId: RUN_ID,
      parentId: PARENT_ID,
      sequence: 0,
    },
    execution: {
      projectId: PROJECT_ID,
      traceId: TRACE_ID,
      workmodeId: 'system:implementation',
    },
    ...overrides,
  };
}

export function createInjectedFrame(content: string): GatewayContextFrame {
  return {
    role: 'system',
    source: 'inbox',
    content,
    createdAt: NOW,
  };
}

export function createGatewayHarness(options?: {
  outputs?: unknown[];
  toolSurface?: IScopedMcpToolSurface;
  lifecycleHooks?: AgentGatewayConfig['lifecycleHooks'];
  witnessService?: AgentGatewayConfig['witnessService'];
  now?: () => string;
  nowMs?: () => number;
  outbox?: InMemoryGatewayOutboxSink;
  agentClass?: AgentGatewayConfig['agentClass'];
}): {
  gateway: AgentGateway;
  outbox: InMemoryGatewayOutboxSink;
  toolSurface: IScopedMcpToolSurface;
  modelProvider: IModelProvider;
} {
  const outbox = options?.outbox ?? new InMemoryGatewayOutboxSink();
  const toolSurface = options?.toolSurface ?? createToolSurface();
  const modelProvider =
    options?.outputs ? createModelProvider(options.outputs) : createModelProvider(['']);
  const gateway = new AgentGateway({
    agentClass: options?.agentClass ?? 'Worker',
    agentId: AGENT_ID,
    toolSurface,
    modelProvider,
    lifecycleHooks: options?.lifecycleHooks,
    witnessService: options?.witnessService,
    outbox,
    now: options?.now ?? (() => NOW),
    nowMs: options?.nowMs ?? (() => Date.parse(NOW)),
    idFactory: () => AGENT_ID,
  });

  return {
    gateway,
    outbox,
    toolSurface,
    modelProvider,
  };
}
