import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies to avoid worktree resolution issues
// Provide BacklogEntryStatusSchema inline to avoid worktree resolution issues
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

function createMockContext() {
  return {
    coreExecutor: {
      executeTurn: vi.fn().mockResolvedValue({
        response: 'Follow-up response',
        traceId: 'trace-123',
        memoryCandidates: [],
        pfcDecisions: [],
        contentType: 'text',
      }),
      superviseProject: vi.fn(),
      getTrace: vi.fn(),
    },
    gatewayRuntime: {
      submitTaskToSystem: vi.fn().mockResolvedValue({
        runId: 'run-abc',
        dispatchRef: 'ref-xyz',
        acceptedAt: '2026-03-27T00:00:00Z',
        source: 'card-action',
      }),
      handleChatTurn: vi.fn().mockResolvedValue({
        response: 'Follow-up response',
        traceId: 'trace-123',
        contentType: 'text',
      }),
      boot: vi.fn(),
      getStatus: vi.fn(),
      getAgentStatus: vi.fn(),
      getBacklog: vi.fn(),
      getSystemRunActivity: vi.fn(),
      getActiveSystemRunSummaries: vi.fn(),
    },
    stmStore: { getContext: vi.fn().mockResolvedValue({ entries: [], summary: undefined, tokenCount: 0 }) },
  } as any;
}

describe('chat.sendMessage', () => {
  async function getCaller(ctx: any) {
    const { chatRouter } = await import('../src/trpc/routers/chat.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ chat: chatRouter });
    return testRouter.createCaller(ctx);
  }

  it('routes through gatewayRuntime.handleChatTurn', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.sendMessage({ message: 'Hello' });

    expect(ctx.gatewayRuntime.handleChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hello' }),
    );
    expect(result.response).toBe('Follow-up response');
    expect(result.traceId).toBe('trace-123');
  });

  it('passes sessionId (UUID) and scope: principal to handleChatTurn', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.sendMessage({ message: 'Hello' });

    const callArgs = ctx.gatewayRuntime.handleChatTurn.mock.calls[0][0];
    expect(callArgs.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(callArgs.scope).toBe('principal');
  });

  it('does NOT call coreExecutor.executeTurn', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.sendMessage({ message: 'Hello' });

    expect(ctx.coreExecutor.executeTurn).not.toHaveBeenCalled();
  });
});

describe('chat.sendMessage — sessionId', () => {
  async function getCaller(ctx: any) {
    const { chatRouter } = await import('../src/trpc/routers/chat.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ chat: chatRouter });
    return testRouter.createCaller(ctx);
  }

  it('uses provided sessionId instead of generating one', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);
    const providedId = '11111111-1111-1111-1111-111111111111';

    await caller.chat.sendMessage({ message: 'Hello', sessionId: providedId });

    const callArgs = ctx.gatewayRuntime.handleChatTurn.mock.calls[0][0];
    expect(callArgs.sessionId).toBe(providedId);
  });

  it('generates sessionId when not provided', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.sendMessage({ message: 'Hello' });

    const callArgs = ctx.gatewayRuntime.handleChatTurn.mock.calls[0][0];
    expect(callArgs.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

describe('chat.getHistory — sessionId filter', () => {
  async function getCaller(ctx: any) {
    const { chatRouter } = await import('../src/trpc/routers/chat.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ chat: chatRouter });
    return testRouter.createCaller(ctx);
  }

  it('filters entries by sessionId when provided', async () => {
    const sessA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sessB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const ctx = createMockContext();
    ctx.stmStore.getContext.mockResolvedValue({
      entries: [
        { role: 'user', content: 'msg1', timestamp: '2026-01-01T00:00:00Z', metadata: { sessionId: sessA } },
        { role: 'assistant', content: 'resp1', timestamp: '2026-01-01T00:01:00Z', metadata: { sessionId: sessA } },
        { role: 'user', content: 'msg2', timestamp: '2026-01-01T00:02:00Z', metadata: { sessionId: sessB } },
      ],
      summary: undefined,
      tokenCount: 0,
    });
    const caller = await getCaller(ctx);

    const result = await caller.chat.getHistory({ projectId: '00000000-0000-0000-0000-000000000001', sessionId: sessA });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e: any) => e.metadata.sessionId === sessA)).toBe(true);
  });

  it('returns all entries when no sessionId filter', async () => {
    const ctx = createMockContext();
    ctx.stmStore.getContext.mockResolvedValue({
      entries: [
        { role: 'user', content: 'msg1', timestamp: '2026-01-01T00:00:00Z', metadata: { sessionId: 'aaa' } },
        { role: 'user', content: 'msg2', timestamp: '2026-01-01T00:02:00Z', metadata: { sessionId: 'bbb' } },
      ],
      summary: undefined,
      tokenCount: 0,
    });
    const caller = await getCaller(ctx);

    const result = await caller.chat.getHistory({ projectId: '00000000-0000-0000-0000-000000000001' });

    expect(result.entries).toHaveLength(2);
  });
});

describe('chat.listSessions', () => {
  async function getCaller(ctx: any) {
    const { chatRouter } = await import('../src/trpc/routers/chat.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ chat: chatRouter });
    return testRouter.createCaller(ctx);
  }

  it('groups entries by sessionId and returns sorted sessions', async () => {
    const ctx = createMockContext();
    ctx.stmStore.getContext.mockResolvedValue({
      entries: [
        { role: 'user', content: 'Hello session A', timestamp: '2026-01-01T00:00:00Z', metadata: { sessionId: 'aaa', scope: 'principal' } },
        { role: 'assistant', content: 'Response A', timestamp: '2026-01-01T00:01:00Z', metadata: { sessionId: 'aaa', scope: 'principal' } },
        { role: 'user', content: 'Hello session B', timestamp: '2026-01-01T01:00:00Z', metadata: { sessionId: 'bbb', scope: 'project_thread' } },
      ],
      summary: undefined,
      tokenCount: 0,
    });
    const caller = await getCaller(ctx);

    const result = await caller.chat.listSessions({ projectId: '00000000-0000-0000-0000-000000000001' });

    expect(result).toHaveLength(2);
    // Sorted by lastTimestamp descending — session B is newer
    expect(result[0].sessionId).toBe('bbb');
    expect(result[0].scope).toBe('project_thread');
    expect(result[0].firstMessage).toBe('Hello session B');
    expect(result[1].sessionId).toBe('aaa');
    expect(result[1].firstMessage).toBe('Hello session A');
  });

  it('skips entries without sessionId', async () => {
    const ctx = createMockContext();
    ctx.stmStore.getContext.mockResolvedValue({
      entries: [
        { role: 'user', content: 'Legacy msg', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'user', content: 'New msg', timestamp: '2026-01-01T01:00:00Z', metadata: { sessionId: 'aaa', scope: 'principal' } },
      ],
      summary: undefined,
      tokenCount: 0,
    });
    const caller = await getCaller(ctx);

    const result = await caller.chat.listSessions({ projectId: '00000000-0000-0000-0000-000000000001' });

    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('aaa');
  });

  it('returns empty array when no projectId', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.listSessions({});

    expect(result).toEqual([]);
  });
});

describe('chat.sendAction', () => {
  async function getCaller(ctx: any) {
    const { chatRouter } = await import('../src/trpc/routers/chat.js');
    const { router: createRouter } = await import('../src/trpc/trpc.js');
    const testRouter = createRouter({ chat: chatRouter });
    return testRouter.createCaller(ctx);
  }

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  it('followup action calls gatewayRuntime.handleChatTurn with correct args', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.sendAction({
      action: { actionType: 'followup', cardId: 'card-1', payload: { prompt: 'Tell me more' } },
    });

    expect(ctx.gatewayRuntime.handleChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Tell me more',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Follow-up response');
    expect(result.traceId).toBe('trace-123');
    expect(result.contentType).toBe('text');
  });

  it('followup action passes sessionId and scope: principal to handleChatTurn', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.sendAction({
      action: { actionType: 'followup', cardId: 'card-1', payload: { prompt: 'Tell me more' } },
    });

    const callArgs = ctx.gatewayRuntime.handleChatTurn.mock.calls[0][0];
    expect(callArgs.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(callArgs.scope).toBe('principal');
  });

  it('followup action does NOT call coreExecutor.executeTurn', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await caller.chat.sendAction({
      action: { actionType: 'followup', cardId: 'card-1', payload: { prompt: 'Details' } },
    });

    expect(ctx.coreExecutor.executeTurn).not.toHaveBeenCalled();
  });

  it('followup action returns normalized ActionResult', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    const result = await caller.chat.sendAction({
      action: { actionType: 'followup', cardId: 'card-1', payload: { prompt: 'Details' } },
    });

    expect(result).toEqual({
      ok: true,
      message: 'Follow-up response',
      traceId: 'trace-123',
      contentType: 'text',
    });
  });

  it('approve action calls gatewayRuntime.submitTaskToSystem', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);
    const action = { actionType: 'approve' as const, cardId: 'card-2', payload: { reason: 'ok' } };

    const result = await caller.chat.sendAction({ action });

    expect(ctx.gatewayRuntime.submitTaskToSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Card action: approve',
        detail: { cardAction: action },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Action submitted');
    expect(result.traceId).toBe('run-abc');
  });

  it('reject action calls gatewayRuntime.submitTaskToSystem', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);
    const action = { actionType: 'reject' as const, cardId: 'card-3', payload: { reason: 'no' } };

    const result = await caller.chat.sendAction({ action });

    expect(ctx.gatewayRuntime.submitTaskToSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Card action: reject',
        detail: { cardAction: action },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Action submitted');
  });

  it('submit action calls gatewayRuntime.submitTaskToSystem with form payload in detail', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);
    const action = { actionType: 'submit' as const, cardId: 'card-4', payload: { name: 'test', value: 42 } };

    const result = await caller.chat.sendAction({ action });

    expect(ctx.gatewayRuntime.submitTaskToSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Card action: submit',
        detail: { cardAction: action },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('navigate action throws TRPCError with BAD_REQUEST', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.sendAction({
        action: { actionType: 'navigate', cardId: 'card-5', payload: { panel: 'settings' } },
      }),
    ).rejects.toThrow('Navigate actions must be handled client-side');
  });

  it('invalid actionType rejected by Zod validation', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.sendAction({
        action: { actionType: 'invalid' as any, cardId: 'card-6', payload: {} },
      }),
    ).rejects.toThrow();
  });

  it('missing cardId rejected by Zod validation', async () => {
    const ctx = createMockContext();
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.sendAction({
        action: { actionType: 'approve', payload: {} } as any,
      }),
    ).rejects.toThrow();
  });

  // ── Tier 3: Edge Case Tests ─────────────────────────────────────────────

  it('followup action propagates handleChatTurn error', async () => {
    const ctx = createMockContext();
    ctx.gatewayRuntime.handleChatTurn.mockRejectedValueOnce(new Error('Gateway failure'));
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.sendAction({
        action: { actionType: 'followup', cardId: 'card-1', payload: { prompt: 'Test' } },
      }),
    ).rejects.toThrow('Gateway failure');
  });

  it('approve action propagates submitTaskToSystem error', async () => {
    const ctx = createMockContext();
    ctx.gatewayRuntime.submitTaskToSystem.mockRejectedValueOnce(new Error('System inbox full'));
    const caller = await getCaller(ctx);

    await expect(
      caller.chat.sendAction({
        action: { actionType: 'approve', cardId: 'card-2', payload: {} },
      }),
    ).rejects.toThrow('System inbox full');
  });
});
