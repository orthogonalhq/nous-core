import { describe, expect, it, vi } from 'vitest';
import { createDocumentStore } from '../agent-gateway/helpers.js';
import {
  DocumentBacklogStore,
  GatewayRuntimeHealthSink,
  SystemBacklogQueue,
} from '../../gateway-runtime/index.js';

function completedResult(id = 'hf-1') {
  return {
    status: 'completed' as const,
    output: { ok: true },
    v3Packet: {
      nous: { v: 3 },
      route: {
        emitter: { id: 'a::b::c::d' },
        target: { id: 'e::f::g::h' },
      },
      envelope: { direction: 'ingress', type: 'handoff' },
      correlation: {
        handoff_id: id,
        correlation_id: `corr-${id}`,
        cycle: '1',
        emitted_at_utc: '2026-03-13T17:00:00.000Z',
        emitted_at_unix_ms: '1773421200000',
        sequence_in_run: '1',
        emitted_at_unix_us: '1773421200000000',
      },
      payload: { schema: 'artifact-ready.v1', artifact_type: 'test' },
      retry: {
        policy: 'value-proportional',
        depth: 'iterative',
        importance_tier: 'high',
        expected_quality_gain: 0.25,
        estimated_tokens: 1,
        estimated_compute_minutes: 1,
        token_price_ref: 'a',
        compute_price_ref: 'b',
        decision: 'continue',
        decision_log_ref: 'c',
        benchmark_tier: 'nightly',
        self_repair: {
          required_on_fail_close: true,
          orchestration_state: 'deferred',
          approval_role: 'cortex:system',
          implementation_mode: 'dispatch-team',
          plan_ref: 'd',
        },
      },
    },
    correlation: {
      runId: '550e8400-e29b-41d4-a716-446655440201',
      parentId: '550e8400-e29b-41d4-a716-446655440202',
      sequence: 0,
    },
    usage: { turnsUsed: 1, tokensUsed: 5, elapsedMs: 10, spawnUnitsUsed: 0 },
    evidenceRefs: [],
    artifactRefs: [],
  };
}

describe('SystemBacklogQueue', () => {
  it('promotes queued work in deterministic priority order within capacity', async () => {
    const documentStore = createDocumentStore();
    const healthSink = new GatewayRuntimeHealthSink();
    const started: string[] = [];
    let resolveFirst!: () => void;
    const firstRun = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: (() => {
        let counter = 0;
        return () => new Date(Date.UTC(2026, 2, 13, 17, 0, counter++)).toISOString();
      })(),
      executeEntry: async (entry) => {
        started.push(entry.id);
        if (entry.id === 'entry-low') {
          await firstRun;
        }
        return {
          status: 'completed',
          output: { ok: true },
          v3Packet: {
            nous: { v: 3 },
            route: {
              emitter: { id: 'a::b::c::d' },
              target: { id: 'e::f::g::h' },
            },
            envelope: {
              direction: 'ingress',
              type: 'handoff',
            },
            correlation: {
              handoff_id: 'hf-1',
              correlation_id: 'corr-1',
              cycle: '1',
              emitted_at_utc: '2026-03-13T17:00:00.000Z',
              emitted_at_unix_ms: '1773421200000',
              sequence_in_run: '1',
              emitted_at_unix_us: '1773421200000000',
            },
            payload: {
              schema: 'artifact-ready.v1',
              artifact_type: 'test',
            },
            retry: {
              policy: 'value-proportional',
              depth: 'iterative',
              importance_tier: 'high',
              expected_quality_gain: 0.25,
              estimated_tokens: 1,
              estimated_compute_minutes: 1,
              token_price_ref: 'a',
              compute_price_ref: 'b',
              decision: 'continue',
              decision_log_ref: 'c',
              benchmark_tier: 'nightly',
              self_repair: {
                required_on_fail_close: true,
                orchestration_state: 'deferred',
                approval_role: 'cortex:system',
                implementation_mode: 'dispatch-team',
                plan_ref: 'd',
              },
            },
          },
          correlation: {
            runId: '550e8400-e29b-41d4-a716-446655440201',
            parentId: '550e8400-e29b-41d4-a716-446655440202',
            sequence: 0,
          },
          usage: {
            turnsUsed: 1,
            tokensUsed: 5,
            elapsedMs: 10,
            spawnUnitsUsed: 0,
          },
          evidenceRefs: [],
          artifactRefs: [],
        };
      },
    });

    await queue.enqueue({
      id: 'entry-low',
      runId: 'run-low',
      dispatchRef: 'dispatch-low',
      source: 'scheduler',
      priority: 'low',
      instructions: 'low',
      payload: {},
      acceptedAt: '2026-03-13T17:00:00.000Z',
    });
    await queue.enqueue({
      id: 'entry-high',
      runId: 'run-high',
      dispatchRef: 'dispatch-high',
      source: 'principal_tool',
      priority: 'high',
      instructions: 'high',
      payload: {},
      acceptedAt: '2026-03-13T17:00:01.000Z',
    });

    expect(started).toEqual(['entry-low']);
    resolveFirst();
    await queue.whenIdle();

    expect(started).toEqual(['entry-low', 'entry-high']);
    expect(healthSink.getSystemContextReplica().backlogAnalytics.completedInWindow).toBe(2);
  });

  it('requeues suspended work when the lease is released', async () => {
    const documentStore = createDocumentStore();
    const healthSink = new GatewayRuntimeHealthSink();
    const executeEntry = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'suspended',
        reason: 'Lane lease held.',
        resumeWhen: 'lease_release',
        detail: {
          laneKey: 'lane:test',
          leaseId: 'lease-1',
        },
        correlation: {
          runId: '550e8400-e29b-41d4-a716-446655440211',
          parentId: '550e8400-e29b-41d4-a716-446655440212',
          sequence: 0,
        },
        usage: {
          turnsUsed: 0,
          tokensUsed: 0,
          elapsedMs: 0,
          spawnUnitsUsed: 0,
        },
        evidenceRefs: [],
      })
      .mockResolvedValueOnce({
        status: 'completed',
        output: { ok: true },
        v3Packet: {
          nous: { v: 3 },
          route: {
            emitter: { id: 'a::b::c::d' },
            target: { id: 'e::f::g::h' },
          },
          envelope: {
            direction: 'ingress',
            type: 'handoff',
          },
          correlation: {
            handoff_id: 'hf-2',
            correlation_id: 'corr-2',
            cycle: '1',
            emitted_at_utc: '2026-03-13T17:00:00.000Z',
            emitted_at_unix_ms: '1773421200000',
            sequence_in_run: '1',
            emitted_at_unix_us: '1773421200000000',
          },
          payload: {
            schema: 'artifact-ready.v1',
            artifact_type: 'test',
          },
          retry: {
            policy: 'value-proportional',
            depth: 'iterative',
            importance_tier: 'high',
            expected_quality_gain: 0.25,
            estimated_tokens: 1,
            estimated_compute_minutes: 1,
            token_price_ref: 'a',
            compute_price_ref: 'b',
            decision: 'continue',
            decision_log_ref: 'c',
            benchmark_tier: 'nightly',
            self_repair: {
              required_on_fail_close: true,
              orchestration_state: 'deferred',
              approval_role: 'cortex:system',
              implementation_mode: 'dispatch-team',
              plan_ref: 'd',
            },
          },
        },
        correlation: {
          runId: '550e8400-e29b-41d4-a716-446655440213',
          parentId: '550e8400-e29b-41d4-a716-446655440214',
          sequence: 0,
        },
        usage: {
          turnsUsed: 1,
          tokensUsed: 5,
          elapsedMs: 10,
          spawnUnitsUsed: 0,
        },
        evidenceRefs: [],
        artifactRefs: [],
      });

    const queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: () => '2026-03-13T17:00:00.000Z',
      executeEntry,
    });

    await queue.enqueue({
      id: 'entry-suspended',
      runId: 'run-suspended',
      dispatchRef: 'dispatch-suspended',
      source: 'principal_tool',
      priority: 'high',
      instructions: 'lease-held',
      payload: {},
      acceptedAt: '2026-03-13T17:00:00.000Z',
    });

    await vi.waitFor(() => {
      expect(healthSink.getSystemContextReplica().backlogAnalytics.suspendedCount).toBe(1);
    });

    await queue.notifyLeaseReleased({ laneKey: 'lane:test', leaseId: 'lease-1' });
    await queue.whenIdle();

    expect(executeEntry).toHaveBeenCalledTimes(2);
    expect(healthSink.getSystemContextReplica().backlogAnalytics.suspendedCount).toBe(0);
    expect(healthSink.getSystemContextReplica().backlogAnalytics.completedInWindow).toBe(1);
  });

  it('resets stranded active entries to queued before restart execution resumes', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);
    const healthSink = new GatewayRuntimeHealthSink();
    let releaseExecution!: () => void;
    const executeEntry = vi.fn().mockImplementation(
      async () =>
        await new Promise((resolve) => {
          releaseExecution = () =>
            resolve({
              status: 'completed',
              output: { ok: true },
              v3Packet: {
                nous: { v: 3 },
                route: {
                  emitter: { id: 'a::b::c::d' },
                  target: { id: 'e::f::g::h' },
                },
                envelope: {
                  direction: 'ingress',
                  type: 'handoff',
                },
                correlation: {
                  handoff_id: 'hf-3',
                  correlation_id: 'corr-3',
                  cycle: '1',
                  emitted_at_utc: '2026-03-13T17:00:00.000Z',
                  emitted_at_unix_ms: '1773421200000',
                  sequence_in_run: '1',
                  emitted_at_unix_us: '1773421200000000',
                },
                payload: {
                  schema: 'artifact-ready.v1',
                  artifact_type: 'test',
                },
                retry: {
                  policy: 'value-proportional',
                  depth: 'iterative',
                  importance_tier: 'high',
                  expected_quality_gain: 0.25,
                  estimated_tokens: 1,
                  estimated_compute_minutes: 1,
                  token_price_ref: 'a',
                  compute_price_ref: 'b',
                  decision: 'continue',
                  decision_log_ref: 'c',
                  benchmark_tier: 'nightly',
                  self_repair: {
                    required_on_fail_close: true,
                    orchestration_state: 'deferred',
                    approval_role: 'cortex:system',
                    implementation_mode: 'dispatch-team',
                    plan_ref: 'd',
                  },
                },
              },
              correlation: {
                runId: '550e8400-e29b-41d4-a716-446655440215',
                parentId: '550e8400-e29b-41d4-a716-446655440216',
                sequence: 0,
              },
              usage: {
                turnsUsed: 1,
                tokensUsed: 5,
                elapsedMs: 10,
                spawnUnitsUsed: 0,
              },
              evidenceRefs: [],
              artifactRefs: [],
            });
        }),
    );

    await backlogStore.put({
      id: 'entry-recovered',
      status: 'active',
      source: 'hook',
      priority: 'normal',
      priorityRank: 1,
      instructions: 'resume me',
      payload: {},
      dispatchRef: 'dispatch-recovered',
      runId: 'run-recovered',
      acceptedAt: '2026-03-13T16:59:59.000Z',
      promotedAt: '2026-03-13T16:59:59.500Z',
      queueDepthAtAcceptance: 1,
      resultStatus: 'suspended',
    });

    vi.mocked(documentStore.put).mockClear();

    const queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: () => '2026-03-13T17:00:00.000Z',
      executeEntry,
    });

    await vi.waitFor(() => {
      expect(executeEntry).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(documentStore.put).mock.calls[0]?.[2]).toMatchObject({
      id: 'entry-recovered',
      status: 'queued',
      promotedAt: undefined,
      resultStatus: undefined,
    });
    expect(vi.mocked(documentStore.put).mock.calls[1]?.[2]).toMatchObject({
      id: 'entry-recovered',
      status: 'active',
    });
    expect(vi.mocked(documentStore.put).mock.invocationCallOrder[0]).toBeLessThan(
      executeEntry.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );

    releaseExecution();
    await queue.whenIdle();
  });

  it('logs recovery count and emits health event for stranded active entries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);
    const healthSink = new GatewayRuntimeHealthSink();

    await backlogStore.put({
      id: 'stranded-1',
      status: 'active',
      source: 'hook',
      priority: 'normal',
      priorityRank: 1,
      instructions: 'stranded',
      payload: {},
      dispatchRef: 'dispatch-stranded-1',
      runId: 'run-stranded-1',
      acceptedAt: '2026-03-13T16:59:00.000Z',
      promotedAt: '2026-03-13T16:59:01.000Z',
      queueDepthAtAcceptance: 0,
    });
    await backlogStore.put({
      id: 'stranded-2',
      status: 'active',
      source: 'scheduler',
      priority: 'low',
      priorityRank: 0,
      instructions: 'stranded',
      payload: {},
      dispatchRef: 'dispatch-stranded-2',
      runId: 'run-stranded-2',
      acceptedAt: '2026-03-13T16:59:02.000Z',
      promotedAt: '2026-03-13T16:59:03.000Z',
      queueDepthAtAcceptance: 1,
    });

    const _queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: () => '2026-03-13T17:00:00.000Z',
      executeEntry: async () => completedResult(),
    });

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        'Backlog recovery: 2 entries reset from active to queued.',
      );
    });

    expect(healthSink.getBootSnapshot().issueCodes).toContain('backlog_recovery_reset');

    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('logs info with zero count on clean startup', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const documentStore = createDocumentStore();
    const healthSink = new GatewayRuntimeHealthSink();

    const _queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: () => '2026-03-13T17:00:00.000Z',
      executeEntry: async () => completedResult(),
    });

    await vi.waitFor(() => {
      expect(infoSpy).toHaveBeenCalledWith(
        'Backlog recovery: 0 entries reset from active to queued.',
      );
    });

    expect(healthSink.getBootSnapshot().issueCodes).not.toContain('backlog_recovery_reset');

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('promotes multiple entries concurrently with activeCapacity > 1', async () => {
    const documentStore = createDocumentStore();
    const healthSink = new GatewayRuntimeHealthSink();
    const started: string[] = [];
    const resolvers: Array<() => void> = [];

    const queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: (() => {
        let counter = 0;
        return () => new Date(Date.UTC(2026, 2, 13, 17, 0, counter++)).toISOString();
      })(),
      config: { activeCapacity: 2 },
      executeEntry: async (entry) => {
        started.push(entry.id);
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
        return completedResult(entry.id);
      },
    });

    await queue.enqueue({
      id: 'entry-a',
      runId: 'run-a',
      dispatchRef: 'dispatch-a',
      source: 'scheduler',
      priority: 'normal',
      instructions: 'a',
      payload: {},
      acceptedAt: '2026-03-13T17:00:00.000Z',
    });
    await queue.enqueue({
      id: 'entry-b',
      runId: 'run-b',
      dispatchRef: 'dispatch-b',
      source: 'scheduler',
      priority: 'normal',
      instructions: 'b',
      payload: {},
      acceptedAt: '2026-03-13T17:00:01.000Z',
    });
    await queue.enqueue({
      id: 'entry-c',
      runId: 'run-c',
      dispatchRef: 'dispatch-c',
      source: 'scheduler',
      priority: 'normal',
      instructions: 'c',
      payload: {},
      acceptedAt: '2026-03-13T17:00:02.000Z',
    });

    await vi.waitFor(() => {
      expect(started).toHaveLength(2);
    });

    // Two running concurrently, third still queued
    expect(started).toEqual(['entry-a', 'entry-b']);

    // Complete first, third should start
    resolvers[0]!();
    await vi.waitFor(() => {
      expect(started).toHaveLength(3);
    });
    expect(started[2]).toBe('entry-c');

    // Complete remaining
    resolvers[1]!();
    resolvers[2]!();
    await queue.whenIdle();
  });

  it('prunes terminal entries beyond retention window after execution completes', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);
    const healthSink = new GatewayRuntimeHealthSink();

    // Seed an old completed entry beyond the default 7-day retention window
    await backlogStore.put({
      id: 'old-completed',
      status: 'completed',
      source: 'scheduler',
      priority: 'low',
      priorityRank: 0,
      instructions: 'old task',
      payload: {},
      dispatchRef: 'dispatch-old',
      runId: 'run-old',
      acceptedAt: '2026-02-01T00:00:00.000Z',
      promotedAt: '2026-02-01T00:00:01.000Z',
      completedAt: '2026-02-01T00:00:02.000Z',
      queueDepthAtAcceptance: 0,
      resultStatus: 'completed',
    });

    const queue = new SystemBacklogQueue({
      documentStore,
      healthSink,
      now: () => '2026-03-13T17:00:00.000Z',
      executeEntry: async () => completedResult(),
    });

    // Enqueue and let complete — the finally block triggers pruneRetained
    await queue.enqueue({
      id: 'new-entry',
      runId: 'run-new',
      dispatchRef: 'dispatch-new',
      source: 'scheduler',
      priority: 'normal',
      instructions: 'new',
      payload: {},
      acceptedAt: '2026-03-13T17:00:00.000Z',
    });
    await queue.whenIdle();

    // Old entry should have been pruned
    const oldEntry = await backlogStore.get('old-completed');
    expect(oldEntry).toBeNull();
  });

  it('returns accurate pressureTrend from snapshotAnalytics (increasing)', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);

    // Seed entries where recent 25% have much higher wait times than earlier 75%
    const baseTime = Date.UTC(2026, 2, 13, 16, 0, 0);
    for (let i = 0; i < 8; i++) {
      const accepted = new Date(baseTime + i * 60_000).toISOString();
      // Early entries (first 6): short wait (1s), recent entries (last 2): long wait (60s)
      const waitMs = i < 6 ? 1_000 : 60_000;
      const promoted = new Date(Date.parse(accepted) + waitMs).toISOString();
      const completed = new Date(Date.parse(promoted) + 5_000).toISOString();
      await backlogStore.put({
        id: `entry-${i}`,
        status: 'completed',
        source: 'scheduler',
        priority: 'normal',
        priorityRank: 1,
        instructions: `task-${i}`,
        payload: {},
        dispatchRef: `dispatch-${i}`,
        runId: `run-${i}`,
        acceptedAt: accepted,
        promotedAt: promoted,
        completedAt: completed,
        queueDepthAtAcceptance: 0,
        resultStatus: 'completed',
      });
    }

    const analytics = await backlogStore.snapshotAnalytics(
      new Date(baseTime + 3_600_000).toISOString(),
      { activeCapacity: 1, analyticsWindowMs: 3_600_000, retentionWindowMs: 604_800_000 },
    );

    expect(analytics.pressureTrend).toBe('increasing');
  });

  it('returns stable pressureTrend when wait times are uniform', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);

    const baseTime = Date.UTC(2026, 2, 13, 16, 0, 0);
    for (let i = 0; i < 8; i++) {
      const accepted = new Date(baseTime + i * 60_000).toISOString();
      const promoted = new Date(Date.parse(accepted) + 5_000).toISOString();
      const completed = new Date(Date.parse(promoted) + 5_000).toISOString();
      await backlogStore.put({
        id: `entry-${i}`,
        status: 'completed',
        source: 'scheduler',
        priority: 'normal',
        priorityRank: 1,
        instructions: `task-${i}`,
        payload: {},
        dispatchRef: `dispatch-${i}`,
        runId: `run-${i}`,
        acceptedAt: accepted,
        promotedAt: promoted,
        completedAt: completed,
        queueDepthAtAcceptance: 0,
        resultStatus: 'completed',
      });
    }

    const analytics = await backlogStore.snapshotAnalytics(
      new Date(baseTime + 3_600_000).toISOString(),
      { activeCapacity: 1, analyticsWindowMs: 3_600_000, retentionWindowMs: 604_800_000 },
    );

    expect(analytics.pressureTrend).toBe('stable');
  });

  it('returns decreasing pressureTrend when recent waits are shorter', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);

    const baseTime = Date.UTC(2026, 2, 13, 16, 0, 0);
    for (let i = 0; i < 8; i++) {
      const accepted = new Date(baseTime + i * 60_000).toISOString();
      // Early entries (first 6): long wait (60s), recent entries (last 2): short wait (1s)
      const waitMs = i < 6 ? 60_000 : 1_000;
      const promoted = new Date(Date.parse(accepted) + waitMs).toISOString();
      const completed = new Date(Date.parse(promoted) + 5_000).toISOString();
      await backlogStore.put({
        id: `entry-${i}`,
        status: 'completed',
        source: 'scheduler',
        priority: 'normal',
        priorityRank: 1,
        instructions: `task-${i}`,
        payload: {},
        dispatchRef: `dispatch-${i}`,
        runId: `run-${i}`,
        acceptedAt: accepted,
        promotedAt: promoted,
        completedAt: completed,
        queueDepthAtAcceptance: 0,
        resultStatus: 'completed',
      });
    }

    const analytics = await backlogStore.snapshotAnalytics(
      new Date(baseTime + 3_600_000).toISOString(),
      { activeCapacity: 1, analyticsWindowMs: 3_600_000, retentionWindowMs: 604_800_000 },
    );

    expect(analytics.pressureTrend).toBe('decreasing');
  });

  it('returns stable pressureTrend when no terminal entries exist', async () => {
    const documentStore = createDocumentStore();
    const backlogStore = new DocumentBacklogStore(documentStore);

    const analytics = await backlogStore.snapshotAnalytics(
      '2026-03-13T17:00:00.000Z',
      { activeCapacity: 1, analyticsWindowMs: 3_600_000, retentionWindowMs: 604_800_000 },
    );

    expect(analytics.pressureTrend).toBe('stable');
  });
});
