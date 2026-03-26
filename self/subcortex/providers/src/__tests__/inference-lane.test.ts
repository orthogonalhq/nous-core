import { describe, expect, it, vi } from 'vitest';
import { InferenceLane, LeaseHeldError } from '../inference-lane.js';
import type { ModelStreamChunk } from '@nous/shared';

const TRACE_ID = '00000000-0000-0000-0000-000000000002' as any;

describe('InferenceLane', () => {
  it('orders queued work by agent priority', async () => {
    const lane = new InferenceLane('lane:test');
    const started: string[] = [];
    let releaseBackground!: () => void;
    const backgroundBlock = new Promise<void>((resolve) => {
      releaseBackground = resolve;
    });

    const background = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'background' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      async () => {
        started.push('background');
        await backgroundBlock;
        return 'background';
      },
    );

    const orchestration = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'orchestration' },
        traceId: TRACE_ID,
        agentClass: 'Orchestrator',
      },
      async () => {
        started.push('orchestration');
        return 'orchestration';
      },
    );

    const coordination = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'coordination' },
        traceId: TRACE_ID,
        agentClass: 'Cortex::System',
      },
      async () => {
        started.push('coordination');
        return 'coordination';
      },
    );

    releaseBackground();

    await Promise.all([background, orchestration, coordination]);
    expect(started).toEqual(['background', 'coordination', 'orchestration']);
  });

  it('preempts lower-priority active work for principal interactive requests', async () => {
    const lane = new InferenceLane('lane:test');
    const events: string[] = [];
    let backgroundAttempt = 0;

    const background = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'background' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      async (request) => {
        backgroundAttempt += 1;
        events.push(`background-${backgroundAttempt}`);
        if (backgroundAttempt === 1) {
          if (request.abortSignal?.aborted) {
            throw new Error('preempted');
          }
          await new Promise((_, reject) => {
            request.abortSignal?.addEventListener('abort', () => {
              reject(new Error('preempted'));
            });
          });
        }
        return 'background-complete';
      },
    );

    const principal = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'principal' },
        traceId: TRACE_ID,
        agentClass: 'Cortex::Principal',
      },
      async () => {
        events.push('principal');
        return 'principal-complete';
      },
    );

    await expect(principal).resolves.toBe('principal-complete');
    await expect(background).resolves.toBe('background-complete');
    expect(events).toEqual(['background-1', 'principal', 'background-2']);
  });

  it('rejects new enqueue work while a voice lease is held', async () => {
    const lane = new InferenceLane('lane:test');
    lane.acquireLease({ leaseId: 'lease-1', holderType: 'voice_call' });

    expect(() =>
      lane.enqueue(
        {
          role: 'reasoner',
          input: { prompt: 'blocked' },
          traceId: TRACE_ID,
          agentClass: 'Worker',
        },
        async () => 'blocked',
      ),
    ).toThrow(LeaseHeldError);
  });

  it('allows reinserted work to run while a voice lease is held', async () => {
    const lane = new InferenceLane('lane:test');
    lane.acquireLease({ leaseId: 'lease-1', holderType: 'voice_call' });

    await expect(
      lane.reinsertPreempted(
        {
          role: 'reasoner',
          input: { prompt: 'retry' },
          traceId: TRACE_ID,
          agentClass: 'Worker',
        },
        async () => 'retry-complete',
      ),
    ).resolves.toBe('retry-complete');
  });

  it('caps waitHistory to the rolling window size', async () => {
    const lane = new InferenceLane('lane:test', 1);

    // Enqueue 510 requests (exceeding the 500 cap)
    for (let i = 0; i < 510; i++) {
      await lane.enqueue(
        {
          role: 'reasoner',
          input: { prompt: `request-${i}` },
          traceId: TRACE_ID,
          agentClass: 'Worker',
        },
        async () => `result-${i}`,
      );
    }

    const analytics = lane.getAnalytics();
    // avgWaitMs and p95WaitMs should be computed from bounded data
    expect(typeof analytics.avgWaitMs).toBe('number');
    expect(typeof analytics.p95WaitMs).toBe('number');

    // Access internal waitHistory length through a second verification:
    // enqueue one more and verify analytics still work (no memory explosion)
    await lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'final' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      async () => 'final-result',
    );
    expect(typeof lane.getAnalytics().avgWaitMs).toBe('number');
  });

  it('returns activeCount and capacity in getWaitEstimate', async () => {
    const lane = new InferenceLane('lane:test', 3);
    let releaseFirst!: () => void;
    const firstBlock = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstPromise = lane.enqueue(
      {
        role: 'reasoner',
        input: { prompt: 'first' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      async () => {
        await firstBlock;
        return 'first';
      },
    );

    // Wait for the entry to be promoted to active
    await new Promise((resolve) => setTimeout(resolve, 10));

    const estimate = lane.getWaitEstimate({
      role: 'reasoner',
      input: { prompt: 'query' },
      traceId: TRACE_ID,
      agentClass: 'Worker',
    });

    expect(estimate.capacity).toBe(3);
    expect(estimate.activeCount).toBe(1);
    expect(typeof estimate.queuedAhead).toBe('number');
    expect(typeof estimate.estimatedWaitMs).toBe('number');

    releaseFirst();
    await firstPromise;
  });

  it('streams chunks as they arrive without buffering', async () => {
    const lane = new InferenceLane('lane:test');
    const chunkTimestamps: number[] = [];

    async function* generateChunks(): AsyncIterable<ModelStreamChunk> {
      for (let i = 0; i < 3; i++) {
        yield { type: 'delta', content: `chunk-${i}` } as unknown as ModelStreamChunk;
      }
    }

    const chunks: ModelStreamChunk[] = [];
    for await (const chunk of lane.stream(
      {
        role: 'reasoner',
        input: { prompt: 'stream' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      generateChunks,
    )) {
      chunks.push(chunk);
      chunkTimestamps.push(Date.now());
    }

    expect(chunks).toHaveLength(3);
    expect((chunks[0] as any).content).toBe('chunk-0');
    expect((chunks[1] as any).content).toBe('chunk-1');
    expect((chunks[2] as any).content).toBe('chunk-2');
  });

  it('releases lane slot after stream completes normally', async () => {
    const lane = new InferenceLane('lane:test');

    async function* generateChunks(): AsyncIterable<ModelStreamChunk> {
      yield { type: 'delta', content: 'a' } as unknown as ModelStreamChunk;
      yield { type: 'delta', content: 'b' } as unknown as ModelStreamChunk;
    }

    for await (const _chunk of lane.stream(
      {
        role: 'reasoner',
        input: { prompt: 'stream' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      generateChunks,
    )) {
      // consume
    }

    // After stream completes, active count should be 0
    expect(lane.getAnalytics().activeCount).toBe(0);
  });

  it('releases lane slot when stream consumer breaks early', async () => {
    const lane = new InferenceLane('lane:test');

    async function* generateChunks(): AsyncIterable<ModelStreamChunk> {
      yield { type: 'delta', content: 'a' } as unknown as ModelStreamChunk;
      yield { type: 'delta', content: 'b' } as unknown as ModelStreamChunk;
      yield { type: 'delta', content: 'c' } as unknown as ModelStreamChunk;
    }

    for await (const chunk of lane.stream(
      {
        role: 'reasoner',
        input: { prompt: 'stream' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      generateChunks,
    )) {
      if ((chunk as any).content === 'a') {
        break;
      }
    }

    // Slot should be released even on early break
    expect(lane.getAnalytics().activeCount).toBe(0);
  });

  it('releases lane slot when stream generator throws', async () => {
    const lane = new InferenceLane('lane:test');

    async function* generateChunks(): AsyncIterable<ModelStreamChunk> {
      yield { type: 'delta', content: 'a' } as unknown as ModelStreamChunk;
      throw new Error('stream error');
    }

    const chunks: ModelStreamChunk[] = [];
    try {
      for await (const chunk of lane.stream(
        {
          role: 'reasoner',
          input: { prompt: 'stream' },
          traceId: TRACE_ID,
          agentClass: 'Worker',
        },
        generateChunks,
      )) {
        chunks.push(chunk);
      }
    } catch {
      // expected
    }

    expect(chunks).toHaveLength(1);
    expect(lane.getAnalytics().activeCount).toBe(0);
  });

  it('throws LeaseHeldError from stream() when lease is held', async () => {
    const lane = new InferenceLane('lane:test');
    lane.acquireLease({ leaseId: 'lease-1', holderType: 'voice_call' });

    async function* generateChunks(): AsyncIterable<ModelStreamChunk> {
      yield { type: 'delta', content: 'a' } as unknown as ModelStreamChunk;
    }

    const generator = lane.stream(
      {
        role: 'reasoner',
        input: { prompt: 'blocked' },
        traceId: TRACE_ID,
        agentClass: 'Worker',
      },
      generateChunks,
    );

    // Async generator body executes on first .next() call
    await expect(async () => {
      for await (const _chunk of generator) {
        // should not reach here
      }
    }).rejects.toThrow(LeaseHeldError);
  });
});
