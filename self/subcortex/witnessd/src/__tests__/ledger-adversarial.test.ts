import { describe, expect, it } from 'vitest';
import type { WitnessEvent } from '@nous/shared';
import { WitnessService } from '../witness-service.js';
import { createMemoryDocumentStore } from './test-store.js';

describe('WitnessService adversarial cases', () => {
  it('blocks completion when authorization reference is missing', async () => {
    const service = new WitnessService(createMemoryDocumentStore());

    await expect(
      service.appendCompletion({
        actionCategory: 'tool-execute',
        actionRef: 'echo',
        authorizationRef:
          '550e8400-e29b-41d4-a716-446655440000' as import('@nous/shared').WitnessEventId,
        actor: 'core',
        status: 'succeeded',
        detail: {},
      }),
    ).rejects.toThrow(/Authorization event not found/);
  });

  it('detects tamper in witness event hash chain', async () => {
    const store = createMemoryDocumentStore();
    const service = new WitnessService(store, { checkpointInterval: 100 });

    const auth = await service.appendAuthorization({
      actionCategory: 'model-invoke',
      actionRef: 'reasoner',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await service.appendCompletion({
      actionCategory: 'model-invoke',
      actionRef: 'reasoner',
      authorizationRef: auth.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const tampered = await store.get<WitnessEvent>('witness_events', auth.id);
    expect(tampered).toBeTruthy();
    await store.put('witness_events', auth.id, {
      ...tampered,
      payloadHash: 'f'.repeat(64),
    });

    const report = await service.verify();
    expect(report.status).toBe('fail');
    expect(report.invariants.findings.some((f) => f.code.startsWith('CHAIN-'))).toBe(
      true,
    );
  });

  it('detects concealment via missing completion event', async () => {
    const service = new WitnessService(createMemoryDocumentStore());

    await service.appendAuthorization({
      actionCategory: 'memory-write',
      actionRef: 'candidate-42',
      actor: 'pfc',
      status: 'approved',
      detail: {},
    });

    const report = await service.verify();
    expect(report.status).toBe('review');
    expect(report.invariants.findings.some((f) => f.code === 'EVID-MISSING-COMPLETION')).toBe(
      true,
    );
    expect(report.invariants.bySeverity.S1).toBeGreaterThan(0);
  });

  it('detects escalation-path violation as S0', async () => {
    const service = new WitnessService(createMemoryDocumentStore());

    await service.appendInvariant({
      code: 'AUTH-ESCALATION-PATH-VIOLATION',
      actionCategory: 'tool-execute',
      actionRef: 'dangerous-tool',
      actor: 'system',
      detail: { description: 'escalation bypass attempt' },
    });

    const report = await service.verify();
    expect(report.status).toBe('fail');
    expect(report.invariants.bySeverity.S0).toBeGreaterThan(0);
  });

  it('detects correction-flow abuse when historical completion evidence is rewritten', async () => {
    const store = createMemoryDocumentStore();
    const service = new WitnessService(store);

    const authorization = await service.appendAuthorization({
      actionCategory: 'tool-execute',
      actionRef: 'rewrite-target',
      actor: 'pfc',
      status: 'approved',
      detail: {},
    });
    const completion = await service.appendCompletion({
      actionCategory: 'tool-execute',
      actionRef: 'rewrite-target',
      authorizationRef: authorization.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const tamperedCompletion = await store.get<WitnessEvent>(
      'witness_events',
      completion.id,
    );
    expect(tamperedCompletion).toBeTruthy();
    await store.put('witness_events', completion.id, {
      ...tamperedCompletion,
      authorizationRef:
        '660e8400-e29b-41d4-a716-446655440009' as import('@nous/shared').WitnessEventId,
    });

    const report = await service.verify();
    expect(report.status).toBe('fail');
    expect(
      report.invariants.findings.some(
        (finding) => finding.code === 'CHAIN-PAYLOAD-HASH-MISMATCH',
      ),
    ).toBe(true);
  });
});
