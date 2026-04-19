/**
 * view-state tRPC router tests.
 *
 * Covers: round-trip, per-user isolation via composite key, structural
 * rejection of client-supplied userId (.strict()), per-class payload Zod
 * boundary rejection, and the forward-compat malformed-document null path.
 *
 * Uses the `createCaller` pattern with an in-memory mock IDocumentStore
 * keyed by `${collection}:${id}` — mirrors the existing preferences-router
 * test pattern but focused on documentStore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_USER_ID } from '@nous/shared';

// Heavy cross-package mocks to avoid pulling transitive modules during
// router-only testing. Mirrors the pattern used in system-activity-router.test.ts.
vi.mock('@nous/cortex-core', () => ({}));
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

const NOW = '2026-04-18T00:00:00.000Z';
const LATER = '2026-04-18T01:00:00.000Z';

function createMockDocumentStore() {
  const documents = new Map<string, unknown>();

  return {
    store: documents,
    api: {
      put: async <T>(collection: string, id: string, document: T) => {
        documents.set(`${collection}:${id}`, document);
      },
      get: async <T>(collection: string, id: string): Promise<T | null> => {
        const raw = documents.get(`${collection}:${id}`);
        return raw === undefined ? null : (raw as T);
      },
      query: async () => [],
      delete: async (collection: string, id: string) => {
        return documents.delete(`${collection}:${id}`);
      },
    },
  };
}

function makeCtx(
  userId: string,
  documentStore: ReturnType<typeof createMockDocumentStore>['api'],
): any {
  return { userId, documentStore };
}

async function loadRouter() {
  return (await import('../src/trpc/routers/view-state')).viewStateRouter;
}

describe('viewState tRPC router', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  // --- Tier 1: Contract ---

  it('returns null for an absent document', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    const result = await caller.get({ projectId: 'p1', class: 'layout' });
    expect(result).toBeNull();
  });

  it('round-trips set() then get() — same payload and updatedAt', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await caller.set({
      class: 'layout',
      projectId: 'p1',
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    });

    const result = await caller.get({ projectId: 'p1', class: 'layout' });
    expect(result).toEqual({
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    });
  });

  it('set() overwrites with newer updatedAt', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await caller.set({
      class: 'layout',
      projectId: 'p1',
      payload: { sidebarCollapsed: false },
      updatedAt: NOW,
    });
    await caller.set({
      class: 'layout',
      projectId: 'p1',
      payload: { sidebarCollapsed: true },
      updatedAt: LATER,
    });

    const result = await caller.get({ projectId: 'p1', class: 'layout' });
    expect(result).toEqual({
      payload: { sidebarCollapsed: true },
      updatedAt: LATER,
    });
  });

  it('rejects set() with a payload that fails per-class validation (BAD_REQUEST via Zod)', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await expect(
      caller.set({
        class: 'layout',
        projectId: 'p1',
        // Non-object payload should be rejected by LayoutPayloadSchema
        payload: 'not-an-object' as any,
        updatedAt: NOW,
      }),
    ).rejects.toThrow();
  });

  it('rejects get() with a structurally injected userId (.strict())', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await expect(
      caller.get({
        projectId: 'p1',
        class: 'layout',
        userId: 'attacker',
      } as any),
    ).rejects.toThrow();
  });

  it('rejects set() with a structurally injected userId (.strict())', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await expect(
      caller.set({
        class: 'layout',
        projectId: 'p1',
        payload: {},
        updatedAt: NOW,
        userId: 'attacker',
      } as any),
    ).rejects.toThrow();
  });

  // --- Tier 1: Per-user isolation via composite key ---

  it('enforces per-user isolation — userA.set then userB.get returns null', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const userACaller = router.createCaller(makeCtx('user-a', api));
    const userBCaller = router.createCaller(makeCtx('user-b', api));

    await userACaller.set({
      class: 'layout',
      projectId: 'p1',
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    });

    const fromB = await userBCaller.get({ projectId: 'p1', class: 'layout' });
    expect(fromB).toBeNull();

    const fromA = await userACaller.get({ projectId: 'p1', class: 'layout' });
    expect(fromA).toEqual({
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    });
  });

  // --- Tier 2: Forward-compat malformed document path ---

  it('returns null (and logs warn) when the stored document fails envelope validation', async () => {
    const { api, store } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    // Write a malformed document directly — missing required envelope fields.
    store.set('view_state:local:p1:layout', {
      class: 'layout',
      payload: 'broken',
    });

    const result = await caller.get({ projectId: 'p1', class: 'layout' });
    expect(result).toBeNull();
  });

  // --- Tier 2: Class isolation ---

  it('isolates classes — layout and focus under the same project key are independent', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    await caller.set({
      class: 'layout',
      projectId: 'p1',
      payload: { sidebarCollapsed: true },
      updatedAt: NOW,
    });
    await caller.set({
      class: 'focus',
      projectId: 'p1',
      payload: { panelFocus: 'chat' },
      updatedAt: NOW,
    });

    const layout = await caller.get({ projectId: 'p1', class: 'layout' });
    const focus = await caller.get({ projectId: 'p1', class: 'focus' });
    expect((layout?.payload as { sidebarCollapsed: boolean }).sidebarCollapsed).toBe(
      true,
    );
    expect((focus?.payload as { panelFocus: string }).panelFocus).toBe('chat');
  });

  // --- Tier 3: Large content payload acceptance ---

  it('accepts reasonably large content payloads (no perf gate, just no structural rejection)', async () => {
    const { api } = createMockDocumentStore();
    const router = await loadRouter();
    const caller = router.createCaller(makeCtx(DEFAULT_LOCAL_USER_ID, api));

    const big = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`key-${i}`, { nested: i }]),
    );

    await caller.set({
      class: 'content',
      projectId: 'p1',
      payload: big,
      updatedAt: NOW,
    });

    const result = await caller.get({ projectId: 'p1', class: 'content' });
    expect(result?.payload).toEqual(big);
  });
});
