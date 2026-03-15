import { describe, expect, it, vi } from 'vitest';
import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  PublicMcpSubject,
} from '@nous/shared';
import { WitnessService } from '@nous/subcortex-witnessd';
import { AuditProjectionStore } from '../audit-projection-store.js';
import { ExternalSourceMemoryService } from '../external-source-memory-service.js';
import { ExternalSourceStorageAdapter } from '../external-source-storage-adapter.js';
import { NamespaceRegistryStore } from '../namespace-registry-store.js';
import {
  PROMOTED_MEMORY_AUDIT_COLLECTION,
  PROMOTED_MEMORY_TOMBSTONE_COLLECTION,
  PromotedMemoryBridgeService,
} from '../promoted-memory-bridge-service.js';
import { QuotaUsageStore } from '../quota-usage-store.js';
import { RateLimitBucketStore } from '../rate-limit-bucket-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const CLIENT_HASH =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TOKEN_FINGERPRINT =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const NAMESPACE = `app:${CLIENT_HASH}`;

function createSubject(): PublicMcpSubject {
  return {
    class: 'ExternalClient',
    clientId: 'client-1',
    clientIdHash: CLIENT_HASH,
    tokenFingerprint: TOKEN_FINGERPRINT,
    namespace: NAMESPACE,
    scopes: [
      'ortho.memory.stm.read',
      'ortho.memory.stm.write',
      'ortho.memory.stm.delete',
      'ortho.memory.ltm.read',
      'ortho.memory.ltm.write',
      'ortho.memory.ltm.delete',
    ],
    audience: 'urn:nous:ortho:mcp',
  };
}

function createConfidenceResult(
  patternId: string,
): ConfidenceGovernanceEvaluationResult {
  return {
    outcome: 'allow_with_flag',
    reasonCode: 'CGR-ALLOW-WITH-FLAG',
    governance: 'should',
    actionCategory: 'memory-write',
    patternId: patternId as any,
    confidence: 0.88,
    confidenceTier: 'medium',
    supportingSignals: 6,
    autonomyAllowed: false,
    requiresConfirmation: false,
    highRiskOverrideApplied: false,
    evidenceRefs: [{ actionCategory: 'memory-write' }],
    explanation: {
      patternId: patternId as any,
      outcomeRef: `promoted:${patternId}`,
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    },
  };
}

function createServices() {
  const documentStore = createMemoryDocumentStore();
  let idSequence = 0;
  const nextId = () =>
    `00000000-0000-0000-0000-${String(++idSequence).padStart(12, '0')}`;
  const now = () => '2026-03-14T00:00:00.000Z';
  const namespaceStore = new NamespaceRegistryStore(documentStore, { now });
  const storageAdapter = new ExternalSourceStorageAdapter(documentStore);
  const witnessService = new WitnessService(documentStore);
  const pfc = {
    evaluateConfidenceGovernance: vi.fn(
      async (input: ConfidenceGovernanceEvaluationInput) =>
        createConfidenceResult(input.pattern.id),
    ),
  };

  return {
    documentStore,
    externalSourceMemoryService: new ExternalSourceMemoryService({
      documentStore,
      namespaceStore,
      auditStore: new AuditProjectionStore(documentStore),
      storageAdapter,
      quotaStore: new QuotaUsageStore(documentStore),
      rateLimitStore: new RateLimitBucketStore(documentStore),
      witnessService,
      now,
      idFactory: nextId,
    }),
    promotedMemoryBridgeService: new PromotedMemoryBridgeService({
      documentStore,
      namespaceStore,
      storageAdapter,
      witnessService,
      pfc: pfc as any,
      now,
      idFactory: nextId,
    }),
    pfc,
  };
}

describe('PromotedMemoryBridgeService', () => {
  it('promotes an external record with durable provenance and survives source purge', async () => {
    const { externalSourceMemoryService, promotedMemoryBridgeService, pfc } = createServices();
    const subject = createSubject();

    const source = await externalSourceMemoryService.put({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        content: 'durable promoted fact',
        mode: 'append',
        tags: ['fact'],
        metadata: { channel: 'public' },
        idempotencyKey: 'put-promote-1',
      },
    });

    const promoted = await promotedMemoryBridgeService.promote({
      requestId: 'promote-1',
      sourceNamespace: subject.namespace,
      sourceRecordId: source.entryId!,
      rationale: 'retain for internal retrieval',
    });

    expect(promoted.provenance.sourceRecordId).toBe(source.entryId);
    expect(promoted.provenance.sourceNamespace).toBe(subject.namespace);
    expect(promoted.confidenceGovernance.reasonCode).toBe('CGR-ALLOW-WITH-FLAG');
    expect(pfc.evaluateConfidenceGovernance).toHaveBeenCalledTimes(1);

    await externalSourceMemoryService.quarantineSource(subject.namespace, 'policy hold');
    await externalSourceMemoryService.purgeSource(subject.namespace);

    await expect(
      promotedMemoryBridgeService.get({ promotedId: promoted.id, includeDemoted: false }),
    ).resolves.toEqual(expect.objectContaining({ id: promoted.id }));
    await expect(
      promotedMemoryBridgeService.search({
        text: 'durable promoted fact',
        topK: 5,
        includeDemoted: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            record: expect.objectContaining({ id: promoted.id }),
          }),
        ],
      }),
    );
  });

  it('captures source supersession lineage and avoids duplicate active promotions', async () => {
    const { externalSourceMemoryService, promotedMemoryBridgeService } = createServices();
    const subject = createSubject();

    const original = await externalSourceMemoryService.put({
      requestId: '550e8400-e29b-41d4-a716-446655440010',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        content: 'original source fact',
        mode: 'append',
        tags: ['fact'],
        metadata: {},
        idempotencyKey: 'put-original',
      },
    });
    const replacement = await externalSourceMemoryService.put({
      requestId: '550e8400-e29b-41d4-a716-446655440011',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        content: 'replacement fact',
        mode: 'supersede',
        supersedesEntryId: original.entryId!,
        tags: ['fact'],
        metadata: {},
        idempotencyKey: 'put-replacement',
      },
    });

    const promoted = await promotedMemoryBridgeService.promote({
      requestId: 'promote-lineage',
      sourceNamespace: subject.namespace,
      sourceRecordId: replacement.entryId!,
      expectedTier: 'ltm',
      rationale: 'promote active replacement',
    });
    const repeated = await promotedMemoryBridgeService.promote({
      requestId: 'promote-lineage-repeat',
      sourceNamespace: subject.namespace,
      sourceRecordId: replacement.entryId!,
      expectedTier: 'ltm',
      rationale: 'promote active replacement',
    });

    expect(promoted.provenance.sourceSupersedesRecordId).toBe(original.entryId);
    expect(repeated.id).toBe(promoted.id);
  });

  it('demotes a promoted record with a tombstone and excludes it from default reads', async () => {
    const { documentStore, externalSourceMemoryService, promotedMemoryBridgeService } =
      createServices();
    const subject = createSubject();

    const source = await externalSourceMemoryService.put({
      requestId: '550e8400-e29b-41d4-a716-446655440020',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        content: 'demote me',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'put-demote',
      },
    });
    const promoted = await promotedMemoryBridgeService.promote({
      requestId: 'promote-demote',
      sourceNamespace: subject.namespace,
      sourceRecordId: source.entryId!,
      rationale: 'temporary promotion',
    });

    const demoted = await promotedMemoryBridgeService.demote({
      requestId: 'demote-1',
      promotedId: promoted.id,
      rationale: 'no longer needed',
    });

    expect(demoted.lifecycleStatus).toBe('demoted');
    expect(
      await promotedMemoryBridgeService.get({
        promotedId: promoted.id,
        includeDemoted: false,
      }),
    ).toBeNull();
    expect(
      await promotedMemoryBridgeService.get({
        promotedId: promoted.id,
        includeDemoted: true,
      }),
    ).toEqual(expect.objectContaining({ lifecycleStatus: 'demoted' }));
    expect(
      await documentStore.query(PROMOTED_MEMORY_TOMBSTONE_COLLECTION, {}),
    ).toHaveLength(1);
  });

  it('records witness-linked audit rows for successful and rejected promotions', async () => {
    const { documentStore, externalSourceMemoryService, promotedMemoryBridgeService } =
      createServices();
    const subject = createSubject();

    const source = await externalSourceMemoryService.put({
      requestId: '550e8400-e29b-41d4-a716-446655440030',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        content: 'audit me',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'put-audit',
      },
    });

    await promotedMemoryBridgeService.promote({
      requestId: 'promote-audit-success',
      sourceNamespace: subject.namespace,
      sourceRecordId: source.entryId!,
      rationale: 'audit success',
    });
    await externalSourceMemoryService.delete({
      requestId: '550e8400-e29b-41d4-a716-446655440031',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'ltm',
        entryId: source.entryId!,
        mode: 'soft',
        idempotencyKey: 'delete-audit',
      },
    });

    await expect(
      promotedMemoryBridgeService.promote({
        requestId: 'promote-audit-reject',
        sourceNamespace: subject.namespace,
        sourceRecordId: source.entryId!,
        rationale: 'audit reject',
      }),
    ).rejects.toThrow('soft-deleted');

    const audits = await documentStore.query<Record<string, unknown>>(
      PROMOTED_MEMORY_AUDIT_COLLECTION,
      {},
    );
    expect(audits).toHaveLength(2);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'promote',
          outcome: 'completed',
          authorizationEventId: expect.any(String),
          completionEventId: expect.any(String),
        }),
        expect.objectContaining({
          action: 'promote',
          outcome: 'rejected',
          authorizationEventId: expect.any(String),
          completionEventId: expect.any(String),
        }),
      ]),
    );
  });
});
