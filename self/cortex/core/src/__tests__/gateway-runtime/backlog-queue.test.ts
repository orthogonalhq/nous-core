import { describe, expect, it, vi } from 'vitest';
import { createDocumentStore } from '../agent-gateway/helpers.js';
import {
  DocumentBacklogStore,
  GatewayRuntimeHealthSink,
  SystemBacklogQueue,
} from '../../gateway-runtime/index.js';

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
});
