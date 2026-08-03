import { describe, expect, it, vi } from 'vitest';
import type {
  IModelProvider,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderId,
  TraceId,
} from '@nous/shared';
import { NousError, serializeProviderSessionKey } from '@nous/shared';
import {
  CliSessionManager,
  deriveProviderSessionKey,
} from '../../runtime/cli-session-manager.js';
import { AGENT_CLI_PROTOCOL_ID } from '../../protocols/agent-cli/index.js';

const PROVIDER_ID = '10000000-0000-0000-0000-000000000004' as ProviderId;
const OTHER_PROVIDER_ID = '10000000-0000-0000-0000-000000000005' as ProviderId;
const TRACE_ID = '550e8400-e29b-41d4-a716-446655440177' as TraceId;
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440101';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440202';

function config(id: ProviderId = PROVIDER_ID): ModelProviderConfig {
  return {
    id,
    name: 'Codex CLI',
    type: 'text',
    endpoint: 'http://localhost',
    modelId: 'codex-cli/default',
    isLocal: true,
    capabilities: ['text'],
    providerClass: 'local_text',
    vendor: 'codex-cli',
  };
}

function request(input = 'hello'): ModelRequest {
  return {
    role: 'workers',
    input: { prompt: input },
    traceId: TRACE_ID,
  };
}

class FakeProvider implements IModelProvider {
  invokeCount = 0;
  streamCount = 0;
  disposed = false;
  failNext = false;

  constructor(private readonly providerConfig: ModelProviderConfig = config()) {}

  getConfig(): ModelProviderConfig {
    return this.providerConfig;
  }

  async invoke(modelRequest: ModelRequest): Promise<ModelResponse> {
    this.invokeCount += 1;
    if (this.failNext) {
      this.failNext = false;
      throw new NousError('process crashed', 'PROVIDER_UNAVAILABLE');
    }
    return {
      output: `ok:${(modelRequest.input as { prompt: string }).prompt}`,
      providerId: this.providerConfig.id,
      usage: { computeMs: 1 },
      traceId: modelRequest.traceId,
    };
  }

  async *stream(): AsyncIterable<ModelStreamChunk> {
    this.streamCount += 1;
    yield { content: 'ok', done: false };
    yield { content: '', done: true };
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('CliSessionManager', () => {
  it('derives project-scoped and system-wide provider session keys', () => {
    const projectKey = deriveProviderSessionKey({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'project_thread',
      projectId: PROJECT_ID,
      provider: new FakeProvider(),
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    expect(projectKey).toEqual({
      providerId: PROVIDER_ID,
      fixtureRole: 'project_thread',
      projectId: PROJECT_ID,
      chatSessionId: SESSION_ID,
    });

    const systemKey = deriveProviderSessionKey({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      projectId: PROJECT_ID,
      provider: new FakeProvider(),
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    expect(systemKey).toEqual({
      providerId: PROVIDER_ID,
      fixtureRole: 'principal',
      chatSessionId: SESSION_ID,
    });
    expect(serializeProviderSessionKey(systemKey)).toBe(
      `${PROVIDER_ID}::principal::::${SESSION_ID}`,
    );
  });

  it('returns passthrough provider for non-agent-cli or missing session context', () => {
    const provider = new FakeProvider();
    const manager = new CliSessionManager();

    expect(manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: 'openai',
    })).toBe(provider);
    expect(manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    })).toBe(provider);
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  it('fails closed when a chat surface requires persistent process support but adapter is command-bound', () => {
    const provider = new FakeProvider();
    const manager = new CliSessionManager();

    expect(() => manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
      executionCapabilityProfile: 'session_bound_command',
      requiredExecutionCapabilityProfile: 'persistent_process',
    })).toThrowError(/incompatible/i);
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  it('creates and reuses a session-aware provider for the same compatible chat key', async () => {
    const provider = new FakeProvider();
    const createPinnedProvider = vi.fn(({ provider: inner }) => inner);
    const manager = new CliSessionManager({ createPinnedProvider });

    const first = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
      executionCapabilityProfile: 'persistent_process',
      requiredExecutionCapabilityProfile: 'persistent_process',
    });
    const second = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
      executionCapabilityProfile: 'persistent_process',
      requiredExecutionCapabilityProfile: 'persistent_process',
    });

    expect(second).toBe(first);
    expect(createPinnedProvider).toHaveBeenCalledTimes(1);
    expect(manager.getActiveSessionCount()).toBe(1);

    await first.invoke(request('one'));
    await second.invoke(request('two'));

    expect(provider.invokeCount).toBe(2);
    expect(manager.getSessionSnapshots()[0]).toMatchObject({
      executionCapabilityProfile: 'persistent_process',
      state: 'active',
      turnCount: 2,
    });
  });

  it('uses fixture scope and project id to isolate sessions', () => {
    const provider = new FakeProvider();
    const manager = new CliSessionManager();

    const principal = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    const projectA = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'project_thread',
      projectId: PROJECT_ID,
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    const projectB = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'project_thread',
      projectId: '550e8400-e29b-41d4-a716-446655440303',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });

    expect(new Set([principal, projectA, projectB]).size).toBe(3);
    expect(manager.getActiveSessionCount()).toBe(3);
  });

  it('tears down chat close, provider reassignment, and app shutdown scopes', () => {
    const provider = new FakeProvider();
    const manager = new CliSessionManager();

    manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    manager.resolveForChatTurn({
      providerId: OTHER_PROVIDER_ID,
      sessionId: '550e8400-e29b-41d4-a716-446655440404',
      scope: 'principal',
      provider: new FakeProvider(config(OTHER_PROVIDER_ID)),
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });

    manager.teardown('chat_close', { sessionId: SESSION_ID });
    expect(manager.getActiveSessionCount()).toBe(1);

    manager.teardown('provider_reassignment', { providerId: OTHER_PROVIDER_ID });
    expect(manager.getActiveSessionCount()).toBe(0);

    manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    manager.teardownAll();
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  it('defers explicit cancellation teardown until a busy turn completes', async () => {
    let release!: () => void;
    const provider = new FakeProvider();
    vi.spyOn(provider, 'invoke').mockImplementationOnce(async (modelRequest) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        output: 'done',
        providerId: provider.getConfig().id,
        usage: {},
        traceId: modelRequest.traceId,
      };
    });
    const manager = new CliSessionManager();
    const wrapped = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });

    const pending = wrapped.invoke(request());
    manager.teardown('explicit_cancellation', { sessionId: SESSION_ID });
    expect(manager.getSessionSnapshots()[0]?.state).toBe('teardown');

    release();
    await pending;
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  it('removes crashed sessions and creates a fresh session on the next turn', async () => {
    const provider = new FakeProvider();
    const createPinnedProvider = vi.fn(({ provider: inner }) => inner);
    const manager = new CliSessionManager({ createPinnedProvider });
    const wrapped = manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });

    provider.failNext = true;
    await expect(wrapped.invoke(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(manager.getActiveSessionCount()).toBe(0);

    manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider,
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    });
    expect(createPinnedProvider).toHaveBeenCalledTimes(2);
  });

  it('surfaces restart failure without one-shot fallback', () => {
    const manager = new CliSessionManager({
      createPinnedProvider: () => {
        throw new Error('spawn failed');
      },
    });

    expect(() => manager.resolveForChatTurn({
      providerId: PROVIDER_ID,
      sessionId: SESSION_ID,
      scope: 'principal',
      provider: new FakeProvider(),
      providerProtocol: AGENT_CLI_PROTOCOL_ID,
    })).toThrowError(/restart failed/i);
  });
});
