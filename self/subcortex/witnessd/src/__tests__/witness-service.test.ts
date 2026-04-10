import { describe, expect, it } from 'vitest';
import { WitnessService } from '../witness-service.js';
import { createMemoryDocumentStore } from './test-store.js';

const FIXED_NOW = '2026-01-01T00:00:00.000Z';

function createDeterministicIdFactory() {
  const ids = [
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440005',
    '550e8400-e29b-41d4-a716-446655440006',
  ];
  let index = 0;
  return () => ids[index++] ?? ids[ids.length - 1]!;
}

describe('WitnessService', () => {
  it('appends authorization and completion evidence with chain linkage', async () => {
    const service = new WitnessService(createMemoryDocumentStore(), {
      checkpointInterval: 100,
    });

    const authorization = await service.appendAuthorization({
      actionCategory: 'model-invoke',
      actionRef: 'reasoner',
      actor: 'core',
      status: 'approved',
      detail: { role: 'cortex-chat' },
    });

    const completion = await service.appendCompletion({
      actionCategory: 'model-invoke',
      actionRef: 'reasoner',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: { durationMs: 1 },
    });

    expect(authorization.sequence).toBe(1);
    expect(completion.sequence).toBe(2);
    expect(completion.authorizationRef).toBe(authorization.id);
    expect(completion.previousEventHash).toBe(authorization.eventHash);
  });

  it('creates interval checkpoint deterministically', async () => {
    const service = new WitnessService(createMemoryDocumentStore(), {
      checkpointInterval: 2,
    });

    const authorization = await service.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'trace-1',
      actor: 'core',
      status: 'approved',
      detail: {},
    });

    await service.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'trace-1',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const checkpoint = await service.getLatestCheckpoint();
    expect(checkpoint).toBeTruthy();
    expect(checkpoint?.checkpointSequence).toBe(1);
    expect(checkpoint?.startEventSequence).toBe(1);
    expect(checkpoint?.endEventSequence).toBe(2);
  });

  it('produces pass verification report for healthy chain', async () => {
    const service = new WitnessService(createMemoryDocumentStore(), {
      checkpointInterval: 2,
    });

    const auth = await service.appendAuthorization({
      actionCategory: 'memory-write',
      actionRef: 'candidate-1',
      actor: 'pfc',
      status: 'approved',
      detail: {},
    });
    await service.appendCompletion({
      actionCategory: 'memory-write',
      actionRef: 'candidate-1',
      authorizationRef: auth.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const report = await service.verify();
    expect(report.status).toBe('pass');
    expect(report.ledger.sequenceContiguous).toBe(true);
    expect(report.ledger.hashChainValid).toBe(true);
    expect(report.checkpoints.signaturesValid).toBe(true);
    expect(report.invariants.bySeverity.S0).toBe(0);
    expect(report.receipt.verified).toBe(true);
  });

  it('produces deterministic event ordering and hashes for identical input sequences', async () => {
    const runSequence = async () => {
      const store = createMemoryDocumentStore();
      const service = new WitnessService(store, {
        checkpointInterval: 100,
        now: () => FIXED_NOW,
        idFactory: createDeterministicIdFactory(),
      });

      const authorization = await service.appendAuthorization({
        actionCategory: 'tool-execute',
        actionRef: 'echo',
        actor: 'pfc',
        status: 'approved',
        detail: { reason: 'deterministic test' },
      });
      await service.appendCompletion({
        actionCategory: 'tool-execute',
        actionRef: 'echo',
        authorizationRef: authorization.id,
        actor: 'core',
        status: 'succeeded',
        detail: { durationMs: 4 },
      });

      const events = await store.query<import('@nous/shared').WitnessEvent>(
        'witness_events',
        {
          orderBy: 'sequence',
          orderDirection: 'asc',
        },
      );

      return events.map((event) => ({
        sequence: event.sequence,
        previousEventHash: event.previousEventHash,
        payloadHash: event.payloadHash,
        eventHash: event.eventHash,
        stage: event.stage,
        actionCategory: event.actionCategory,
        authorizationRef: event.authorizationRef ?? null,
      }));
    };

    const firstRun = await runSequence();
    const secondRun = await runSequence();

    expect(firstRun).toEqual(secondRun);
  });
});
