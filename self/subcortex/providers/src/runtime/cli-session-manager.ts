import {
  NousError,
  serializeProviderSessionKey,
  type ChatFixtureScope,
  type CliExecutionCapabilityProfile,
  type CliSessionContext,
  type CliSessionState,
  type CliSessionTeardownReason,
  type ICliSessionManager,
  type IModelProvider,
  type ModelProviderConfig,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
  type ProviderSessionKey,
  type TeardownScope,
} from '@nous/shared';
import { AGENT_CLI_PROTOCOL_ID } from '../protocols/agent-cli/index.js';

export interface CliSessionManagerOptions {
  readonly createPinnedProvider?: (input: {
    readonly key: ProviderSessionKey;
    readonly serializedKey: string;
    readonly executionCapabilityProfile: CliExecutionCapabilityProfile;
    readonly provider: IModelProvider;
  }) => IModelProvider;
  readonly now?: () => number;
}

interface PinnedSession {
  readonly key: ProviderSessionKey;
  readonly serializedKey: string;
  readonly executionCapabilityProfile: CliExecutionCapabilityProfile;
  readonly provider: IModelProvider;
  readonly wrapper: IModelProvider;
  state: CliSessionState;
  restartCount: number;
  turnCount: number;
  createdAt: number;
  lastTurnAt: number;
  pendingTeardownReason?: CliSessionTeardownReason;
}

export interface CliSessionSnapshot {
  readonly key: ProviderSessionKey;
  readonly serializedKey: string;
  readonly executionCapabilityProfile: CliExecutionCapabilityProfile;
  readonly state: CliSessionState;
  readonly restartCount: number;
  readonly turnCount: number;
  readonly createdAt: number;
  readonly lastTurnAt: number;
}

export class CliSessionManager implements ICliSessionManager {
  private readonly sessions = new Map<string, PinnedSession>();
  private readonly createPinnedProvider: NonNullable<CliSessionManagerOptions['createPinnedProvider']>;
  private readonly now: () => number;

  constructor(options: CliSessionManagerOptions = {}) {
    this.createPinnedProvider = options.createPinnedProvider ?? ((input) => input.provider);
    this.now = options.now ?? (() => Date.now());
  }

  resolveForChatTurn(context: CliSessionContext): IModelProvider {
    if (!isChatBoundAgentCliContext(context)) {
      return context.provider;
    }

    const executionCapabilityProfile = resolveExecutionCapabilityProfile(context);
    assertExecutionCapabilityCompatible(context, executionCapabilityProfile);

    const key = deriveProviderSessionKey(context);
    const serializedKey = serializeProviderSessionKey(key);
    const existing = this.sessions.get(serializedKey);
    if (existing && existing.state !== 'dead' && existing.state !== 'teardown') {
      return existing.wrapper;
    }

    const restartCount = existing ? existing.restartCount + 1 : 0;
    this.sessions.delete(serializedKey);
    const provider = this.createSessionProvider(
      key,
      serializedKey,
      executionCapabilityProfile,
      context.provider,
    );
    const session: PinnedSession = {
      key,
      serializedKey,
      executionCapabilityProfile,
      provider,
      wrapper: new SessionBoundProvider(this, serializedKey),
      state: 'active',
      restartCount,
      turnCount: 0,
      createdAt: this.now(),
      lastTurnAt: 0,
    };
    this.sessions.set(serializedKey, session);
    return session.wrapper;
  }

  teardown(reason: CliSessionTeardownReason, scope: TeardownScope = {}): void {
    for (const [serializedKey, session] of this.sessions) {
      if (!matchesTeardownScope(session.key, scope)) continue;

      if (session.state === 'busy') {
        session.state = 'teardown';
        session.pendingTeardownReason = reason;
        continue;
      }

      this.disposeSession(serializedKey);
    }
  }

  teardownAll(): void {
    this.teardown('app_shutdown', {});
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSessionSnapshots(): CliSessionSnapshot[] {
    return Array.from(this.sessions.values()).map((session) => ({
      key: session.key,
      serializedKey: session.serializedKey,
      executionCapabilityProfile: session.executionCapabilityProfile,
      state: session.state,
      restartCount: session.restartCount,
      turnCount: session.turnCount,
      createdAt: session.createdAt,
      lastTurnAt: session.lastTurnAt,
    }));
  }

  private createSessionProvider(
    key: ProviderSessionKey,
    serializedKey: string,
    executionCapabilityProfile: CliExecutionCapabilityProfile,
    provider: IModelProvider,
  ): IModelProvider {
    try {
      return this.createPinnedProvider({
        key,
        serializedKey,
        executionCapabilityProfile,
        provider,
      });
    } catch (error) {
      throw new NousError(
        'CLI provider session restart failed.',
        'PROVIDER_SESSION_RESTART_FAILED',
        {
          providerId: key.providerId,
          fixtureRole: key.fixtureRole,
          chatSessionId: key.chatSessionId,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  runInvoke(serializedKey: string, request: ModelRequest): Promise<ModelResponse> {
    return this.invoke(serializedKey, request);
  }

  runStream(serializedKey: string, request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    return this.stream(serializedKey, request);
  }

  getProviderConfig(serializedKey: string): ModelProviderConfig {
    return this.requireSession(serializedKey).provider.getConfig();
  }

  private async invoke(serializedKey: string, request: ModelRequest): Promise<ModelResponse> {
    const session = this.requireSession(serializedKey);
    session.state = 'busy';
    session.turnCount += 1;
    session.lastTurnAt = this.now();

    try {
      const response = await session.provider.invoke(request);
      this.completeTurn(serializedKey);
      return response;
    } catch (error) {
      this.markDead(serializedKey);
      throw error;
    }
  }

  private async *stream(
    serializedKey: string,
    request: ModelRequest,
  ): AsyncIterable<ModelStreamChunk> {
    const session = this.requireSession(serializedKey);
    session.state = 'busy';
    session.turnCount += 1;
    session.lastTurnAt = this.now();

    try {
      for await (const chunk of session.provider.stream(request)) {
        yield chunk;
      }
      this.completeTurn(serializedKey);
    } catch (error) {
      this.markDead(serializedKey);
      throw error;
    }
  }

  private requireSession(serializedKey: string): PinnedSession {
    const session = this.sessions.get(serializedKey);
    if (!session || session.state === 'dead' || session.state === 'teardown') {
      throw new NousError(
        'CLI provider session is not available.',
        'PROVIDER_SESSION_RESTART_FAILED',
        { serializedKey },
      );
    }
    return session;
  }

  private completeTurn(serializedKey: string): void {
    const session = this.sessions.get(serializedKey);
    if (!session) return;

    if (session.pendingTeardownReason || session.state === 'teardown') {
      this.disposeSession(serializedKey);
      return;
    }

    session.state = 'active';
  }

  private markDead(serializedKey: string): void {
    const session = this.sessions.get(serializedKey);
    if (!session) return;
    session.state = 'dead';
    this.disposeSession(serializedKey);
  }

  private disposeSession(serializedKey: string): void {
    const session = this.sessions.get(serializedKey);
    if (!session) return;
    this.sessions.delete(serializedKey);
    disposeProvider(session.provider);
  }
}

class SessionBoundProvider implements IModelProvider {
  constructor(
    private readonly manager: CliSessionManager,
    private readonly serializedKey: string,
  ) {}

  getConfig() {
    return this.manager.getProviderConfig(this.serializedKey);
  }

  invoke(request: ModelRequest): Promise<ModelResponse> {
    return this.manager.runInvoke(this.serializedKey, request);
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    return this.manager.runStream(this.serializedKey, request);
  }
}

function isChatBoundAgentCliContext(context: CliSessionContext): boolean {
  return context.providerProtocol === AGENT_CLI_PROTOCOL_ID &&
    typeof context.sessionId === 'string' &&
    context.sessionId.length > 0 &&
    context.scope !== undefined;
}

function resolveExecutionCapabilityProfile(
  context: CliSessionContext,
): CliExecutionCapabilityProfile {
  return context.executionCapabilityProfile ?? 'session_bound_command';
}

const EXECUTION_CAPABILITY_RANK: Record<CliExecutionCapabilityProfile, number> = {
  one_shot_command: 0,
  session_bound_command: 1,
  persistent_process: 2,
};

function assertExecutionCapabilityCompatible(
  context: CliSessionContext,
  actual: CliExecutionCapabilityProfile,
): void {
  const required = context.requiredExecutionCapabilityProfile;
  if (!required) return;

  if (EXECUTION_CAPABILITY_RANK[actual] >= EXECUTION_CAPABILITY_RANK[required]) {
    return;
  }

  throw new NousError(
    'CLI provider execution capability is incompatible with this chat surface.',
    'PROVIDER_CHAT_CAPABILITY_UNSUPPORTED',
    {
      providerId: context.providerId,
      providerProtocol: context.providerProtocol,
      executionCapabilityProfile: actual,
      requiredExecutionCapabilityProfile: required,
      sessionId: context.sessionId,
      scope: context.scope,
    },
  );
}

export function deriveProviderSessionKey(context: CliSessionContext): ProviderSessionKey {
  if (!context.sessionId || !context.scope) {
    throw new NousError(
      'CLI session context is missing chat session identity.',
      'PROVIDER_SESSION_RESTART_FAILED',
      { providerId: context.providerId },
    );
  }

  const fixtureRole = context.scope;
  return {
    providerId: context.providerId,
    fixtureRole,
    ...(isProjectScoped(fixtureRole, context.projectId)
      ? { projectId: context.projectId }
      : {}),
    chatSessionId: context.sessionId,
  };
}

function isProjectScoped(
  fixtureRole: ChatFixtureScope,
  projectId: string | undefined,
): projectId is string {
  return fixtureRole === 'project_thread' && typeof projectId === 'string' && projectId.length > 0;
}

function matchesTeardownScope(key: ProviderSessionKey, scope: TeardownScope): boolean {
  if (scope.providerId !== undefined && key.providerId !== scope.providerId) return false;
  if (scope.sessionId !== undefined && key.chatSessionId !== scope.sessionId) return false;
  if (scope.fixtureRole !== undefined && key.fixtureRole !== scope.fixtureRole) return false;
  return true;
}

function disposeProvider(provider: IModelProvider): void {
  const disposable = provider as { dispose?: () => void };
  try {
    disposable.dispose?.();
  } catch {
    // Teardown must be best-effort and never mask the original lifecycle path.
  }
}
