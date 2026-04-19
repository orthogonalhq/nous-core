/**
 * SP 1.6 — chat.fireWelcomeIfUnsent tRPC mutation Tier-1 contract tests
 * (T11-T13). Verifies routing-to-coordinator and Zod schema enforcement
 * at the wire boundary.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock heavy workspace dependencies (chat router pulls them in transitively).
vi.mock('@nous/cortex-core', async () => {
  const { z } = await import('zod');
  return {
    BacklogEntryStatusSchema: z.enum(['queued', 'active', 'suspended', 'completed', 'failed']),
  };
});
vi.mock('@nous/cortex-pfc', () => ({}));
vi.mock('@nous/subcortex-apps', () => ({}));
vi.mock('@nous/subcortex-artifacts', () => ({}));
vi.mock('@nous/subcortex-coding-agents', () => ({}));
vi.mock('@nous/subcortex-communication-gateway', () => ({}));
vi.mock('@nous/subcortex-endpoint-trust', () => ({}));
vi.mock('@nous/subcortex-escalation', () => ({}));
vi.mock('@nous/subcortex-gtm', () => ({}));
vi.mock('@nous/subcortex-mao', () => ({}));
vi.mock('@nous/subcortex-nudges', () => ({}));
vi.mock('@nous/subcortex-opctl', () => ({}));
vi.mock('@nous/subcortex-projects', () => ({}));
vi.mock('@nous/subcortex-providers', () => ({}));
vi.mock('@nous/subcortex-public-mcp', () => ({}));
vi.mock('@nous/subcortex-registry', () => ({}));
vi.mock('@nous/subcortex-router', () => ({}));
vi.mock('@nous/subcortex-scheduler', () => ({}));
vi.mock('@nous/subcortex-tools', () => ({}));
vi.mock('@nous/subcortex-voice-control', () => ({}));
vi.mock('@nous/subcortex-witnessd', () => ({}));
vi.mock('@nous/subcortex-workflows', () => ({}));
vi.mock('@nous/memory-access', () => ({}));
vi.mock('@nous/memory-knowledge-index', () => ({}));
vi.mock('@nous/memory-mwc', () => ({}));
vi.mock('@nous/memory-stm', () => ({}));
vi.mock('@nous/memory-distillation', () => ({}));
vi.mock('@nous/autonomic-config', () => ({}));
vi.mock('@nous/autonomic-credentials', () => ({}));
vi.mock('@nous/autonomic-embeddings', () => ({}));
vi.mock('@nous/autonomic-health', () => ({}));
vi.mock('@nous/autonomic-runtime', () => ({}));
vi.mock('@nous/autonomic-storage', () => ({}));

// Mock the welcome coordinator at module load so the chat router routes
// through this mock, not the real coordinator (which would need the full
// gateway-runtime + STM stack wired).
const fireWelcomeIfUnsentMock = vi.hoisted(() => vi.fn());
vi.mock('../src/welcome/welcome-coordinator.js', () => ({
  fireWelcomeIfUnsent: fireWelcomeIfUnsentMock,
}));

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function createMockContext() {
  return {
    coreExecutor: { executeTurn: vi.fn(), superviseProject: vi.fn(), getTrace: vi.fn() },
    gatewayRuntime: {
      handleChatTurn: vi.fn(),
      submitTaskToSystem: vi.fn(),
      boot: vi.fn(),
      getStatus: vi.fn(),
      getAgentStatus: vi.fn(),
      getBacklog: vi.fn(),
      getSystemRunActivity: vi.fn(),
      getActiveSystemRunSummaries: vi.fn(),
    },
    stmStore: {
      getContext: vi.fn(),
      append: vi.fn().mockResolvedValue(undefined),
    },
    config: {
      getWelcomeMessageSent: vi.fn().mockReturnValue(false),
      setWelcomeMessageSent: vi.fn().mockResolvedValue(undefined),
      getPersonalityConfig: vi.fn().mockReturnValue({ preset: 'balanced' }),
    },
  } as unknown as Parameters<
    Awaited<ReturnType<typeof getCaller>>['chat']['fireWelcomeIfUnsent']
  >;
}

async function getCaller(ctx: unknown) {
  const { chatRouter } = await import('../src/trpc/routers/chat.js');
  const { router: createRouter } = await import('../src/trpc/trpc.js');
  const testRouter = createRouter({ chat: chatRouter });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return testRouter.createCaller(ctx as any);
}

describe('chat.fireWelcomeIfUnsent — tRPC mutation', () => {
  beforeEach(() => {
    fireWelcomeIfUnsentMock.mockReset();
  });

  // T11 — Mutation routes to coordinator with composed deps and the right projectId.
  it('T11 routes to coordinator with deps composed from ctx and the input projectId', async () => {
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' });
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.fireWelcomeIfUnsent({ projectId: PROJECT_ID });

    expect(fireWelcomeIfUnsentMock).toHaveBeenCalledTimes(1);
    const [deps, args] = fireWelcomeIfUnsentMock.mock.calls[0] as [
      { gatewayRuntime: unknown; configManager: unknown; stmStore: unknown },
      { projectId: string },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deps.gatewayRuntime).toBe((ctx as any).gatewayRuntime);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deps.configManager).toBe((ctx as any).config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(deps.stmStore).toBe((ctx as any).stmStore);
    expect(args).toEqual({ projectId: PROJECT_ID });
    expect(result).toEqual({ welcomeFired: true, traceId: 'tr-1' });
  });

  it('T11b routes with projectId undefined when omitted from input', async () => {
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: false, reason: 'no_project_id' });
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.fireWelcomeIfUnsent({});

    const args = fireWelcomeIfUnsentMock.mock.calls[0]?.[1] as { projectId?: string };
    expect(args.projectId).toBeUndefined();
  });

  // T12 — Output schema validates success shape; missing traceId fails.
  it('T12 output schema accepts welcomeFired:true with traceId; rejects missing traceId', async () => {
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' });
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const ok = await caller.chat.fireWelcomeIfUnsent({ projectId: PROJECT_ID });
    expect(ok).toEqual({ welcomeFired: true, traceId: 'tr-1' });

    // Now the coordinator returns a malformed payload (missing traceId).
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: true });
    await expect(
      caller.chat.fireWelcomeIfUnsent({ projectId: PROJECT_ID }),
    ).rejects.toThrow();
  });

  // T13 — Output schema validates each documented failure reason; rejects bogus reason.
  it.each([
    'already_sent',
    'composition_error',
    'empty_response',
    'stm_append_error',
    'no_project_id',
  ] as const)('T13 output schema accepts welcomeFired:false reason %s', async (reason) => {
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: false, reason });
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.fireWelcomeIfUnsent({ projectId: PROJECT_ID });
    expect(result).toEqual({ welcomeFired: false, reason });
  });

  it('T13b output schema rejects an invalid reason value', async () => {
    fireWelcomeIfUnsentMock.mockResolvedValue({ welcomeFired: false, reason: 'foo' });
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.fireWelcomeIfUnsent({ projectId: PROJECT_ID }),
    ).rejects.toThrow();
  });
});
