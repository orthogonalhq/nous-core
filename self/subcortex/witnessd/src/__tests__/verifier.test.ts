import { describe, expect, it } from 'vitest';
import type { WitnessCheckpoint } from '@nous/shared';
import { WitnessService } from '../witness-service.js';
import { createMemoryDocumentStore } from './test-store.js';

describe('Witness verifier and checkpoint signatures', () => {
  it('verifies checkpoint signatures across key epoch rotation', async () => {
    const service = new WitnessService(createMemoryDocumentStore(), {
      checkpointInterval: 2,
    });

    const auth1 = await service.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'trace-1',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await service.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'trace-1',
      authorizationRef: auth1.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const nextEpoch = await service.rotateKeyEpoch();
    expect(nextEpoch).toBe(2);

    const auth2 = await service.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: 'trace-2',
      actor: 'core',
      status: 'approved',
      detail: {},
    });
    await service.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: 'trace-2',
      authorizationRef: auth2.id,
      actor: 'core',
      status: 'succeeded',
      detail: {},
    });

    const report = await service.verify();
    expect(report.status).toBe('pass');
    expect(report.checkpoints.signaturesValid).toBe(true);
    expect(report.checkpoints.checkpointCount).toBeGreaterThanOrEqual(2);
  });

  it('fails verification when checkpoint signature is tampered', async () => {
    const store = createMemoryDocumentStore();
    const service = new WitnessService(store, {
      checkpointInterval: 2,
    });

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

    const latest = await service.getLatestCheckpoint();
    expect(latest).toBeTruthy();
    const tampered = {
      ...latest!,
      signature: 'invalid-signature',
    };
    await store.put(
      'witness_checkpoints',
      tampered.id,
      tampered as WitnessCheckpoint,
    );

    const report = await service.verify();
    expect(report.status).toBe('fail');
    expect(report.checkpoints.signaturesValid).toBe(false);
    expect(
      report.invariants.findings.some(
        (finding) => finding.code === 'CHAIN-CHECKPOINT-SIGNATURE-INVALID',
      ),
    ).toBe(true);
  });
});
