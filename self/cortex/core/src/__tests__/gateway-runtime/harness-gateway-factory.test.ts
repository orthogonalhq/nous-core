import { describe, expect, it, vi } from 'vitest';
import { HarnessGatewayFactory } from '../../gateway-runtime/harness-gateway-factory.js';
import type {
  AgentGatewayConfig,
  IAgentGateway,
  IAgentGatewayFactory,
  IScopedMcpToolSurface,
  IModelProvider,
  AgentInput,
} from '@nous/shared';

const AGENT_ID = '550e8400-e29b-41d4-a716-446655440100';

function createMockGatewayFactory(): IAgentGatewayFactory & { lastConfig: AgentGatewayConfig | null } {
  const factory = {
    lastConfig: null as AgentGatewayConfig | null,
    create: vi.fn().mockImplementation((config: AgentGatewayConfig): IAgentGateway => {
      factory.lastConfig = config;
      return {
        agentClass: config.agentClass,
        agentId: config.agentId,
        getInboxHandle: vi.fn(),
        run: vi.fn(),
      };
    }),
  };
  return factory;
}

function createMockToolSurface(): IScopedMcpToolSurface {
  return {
    listTools: vi.fn().mockResolvedValue([]),
    executeTool: vi.fn(),
  };
}

function createMockProvider(): IModelProvider {
  return {
    invoke: vi.fn(),
    stream: vi.fn(),
    getConfig: vi.fn().mockReturnValue({
      id: 'test-provider',
      name: 'test',
      type: 'text',
      modelId: 'test-model',
      isLocal: true,
      capabilities: [],
    }),
  };
}

describe('HarnessGatewayFactory', () => {
  it('creates gateway with loopConfig for any agent class', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Cortex::System',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    expect(inner.lastConfig?.harness?.loopConfig).toBeDefined();
  });

  it('creates gateway for Worker with correct loop config', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    expect(inner.lastConfig?.harness?.loopConfig?.singleTurn).toBe(false);
  });

  it('creates gateway for Orchestrator with correct strategy bundle', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Orchestrator',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    const harness = inner.lastConfig?.harness;
    expect(harness?.promptFormatter).toBeTypeOf('function');
    expect(harness?.responseParser).toBeTypeOf('function');
    expect(harness?.contextStrategy).toBeDefined();
    expect(harness?.loopConfig).toBeDefined();
  });

  it('delegates to deps.agentGatewayFactory.create() with composed config', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    expect(inner.create).toHaveBeenCalledTimes(1);
    expect(inner.lastConfig?.agentClass).toBe('Worker');
    expect(inner.lastConfig?.agentId).toBe(AGENT_ID);
  });

  it('uses baseSystemPromptOverride when provided', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
      baseSystemPromptOverride: 'Custom system prompt override',
    });

    expect(inner.lastConfig?.baseSystemPrompt).toBe('Custom system prompt override');
  });

  it('falls back to composeSystemPromptFromConfig when no override', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    // baseSystemPrompt should be composed from profile (non-empty string)
    expect(inner.lastConfig?.baseSystemPrompt).toBeTruthy();
    expect(typeof inner.lastConfig?.baseSystemPrompt).toBe('string');
  });

  it('resolves provider via modelProviderByClass', () => {
    const inner = createMockGatewayFactory();
    const provider = createMockProvider();
    const factory = new HarnessGatewayFactory({
      agentGatewayFactory: inner,
      modelProviderByClass: { Worker: provider },
    });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    expect(inner.lastConfig?.modelProvider).toBe(provider);
  });

  it('contextStrategy.getDefaults() returns resolved budget', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    const defaults = inner.lastConfig?.harness?.contextStrategy?.getDefaults();
    expect(defaults).toBeDefined();
    expect(typeof defaults?.maxContextTokens).toBe('number');
  });

  it('promptFormatter produces valid output', () => {
    const inner = createMockGatewayFactory();
    const factory = new HarnessGatewayFactory({ agentGatewayFactory: inner });

    factory.create({
      agentClass: 'Worker',
      agentId: AGENT_ID,
      toolSurface: createMockToolSurface(),
      providerType: 'ollama',
    });

    const result = inner.lastConfig?.harness?.promptFormatter?.({
      agentClass: 'Worker',
      taskInstructions: 'Do the task.',
    });
    expect(result?.systemPrompt).toBeTruthy();
    expect(typeof result?.systemPrompt).toBe('string');
  });
});
