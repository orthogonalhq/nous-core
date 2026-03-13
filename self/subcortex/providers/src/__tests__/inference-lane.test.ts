import { describe, expect, it } from 'vitest';
import { InferenceLane, LeaseHeldError } from '../inference-lane.js';

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
});
