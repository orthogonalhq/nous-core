import { describe, expect, it } from 'vitest';
import type { PublicMcpSubject } from '@nous/shared';
import { AuditProjectionStore } from '../audit-projection-store.js';
import { ExternalSourceMemoryService } from '../external-source-memory-service.js';
import { ExternalSourceStorageAdapter } from '../external-source-storage-adapter.js';
import { NamespaceRegistryStore } from '../namespace-registry-store.js';
import { QuotaUsageStore } from '../quota-usage-store.js';
import { RateLimitBucketStore } from '../rate-limit-bucket-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const CLIENT_HASH =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TOKEN_FINGERPRINT =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const NAMESPACE = `app:${CLIENT_HASH}`;

function createService() {
  const documentStore = createMemoryDocumentStore();
  let idSequence = 0;
  const nextId = () => `entry-${++idSequence}`;
  const now = () => '2026-03-14T00:00:00.000Z';

  const service = new ExternalSourceMemoryService({
    documentStore,
    namespaceStore: new NamespaceRegistryStore(documentStore, { now }),
    auditStore: new AuditProjectionStore(documentStore),
    storageAdapter: new ExternalSourceStorageAdapter(documentStore),
    quotaStore: new QuotaUsageStore(documentStore),
    rateLimitStore: new RateLimitBucketStore(documentStore),
    now,
    idFactory: nextId,
  });

  const subject: PublicMcpSubject = {
    class: 'ExternalClient' as const,
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

  return {
    documentStore,
    service,
    subject,
  };
}

describe('ExternalSourceMemoryService', () => {
  it('keeps superseded and soft-deleted entries out of default reads and searches', async () => {
    const { service, subject } = createService();

    const original = await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'alpha memory',
        mode: 'append',
        tags: ['note'],
        metadata: {},
        idempotencyKey: 'put-1',
      },
    });

    const replacement = await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440001',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'alpha memory revised',
        mode: 'supersede',
        supersedesEntryId: original.entryId!,
        tags: ['note'],
        metadata: {},
        idempotencyKey: 'put-2',
      },
    });

    expect(
      await service.get({
        requestId: '550e8400-e29b-41d4-a716-446655440002',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: subject.namespace,
          tier: 'stm',
          entryId: original.entryId!,
          includeDeleted: false,
        },
      }),
    ).toBeNull();

    const searchBeforeDelete = await service.search({
      requestId: '550e8400-e29b-41d4-a716-446655440003',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        query: 'alpha revised',
        limit: 10,
        includeDeleted: false,
      },
    });

    expect(searchBeforeDelete.entries.map((item) => item.entry.id)).toEqual([
      replacement.entryId,
    ]);

    await service.delete({
      requestId: '550e8400-e29b-41d4-a716-446655440004',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        entryId: replacement.entryId!,
        mode: 'soft',
        idempotencyKey: 'delete-1',
      },
    });

    expect(
      await service.get({
        requestId: '550e8400-e29b-41d4-a716-446655440005',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: subject.namespace,
          tier: 'stm',
          entryId: replacement.entryId!,
          includeDeleted: false,
        },
      }),
    ).toBeNull();

    const deletedVisible = await service.get({
      requestId: '550e8400-e29b-41d4-a716-446655440006',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        entryId: replacement.entryId!,
        includeDeleted: true,
      },
    });

    expect(deletedVisible?.lifecycleStatus).toBe('soft-deleted');
  });

  it('rejects cross-namespace access before store mutation', async () => {
    const { documentStore, service, subject } = createService();

    await expect(
      service.put({
        requestId: '550e8400-e29b-41d4-a716-446655440010',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: `app:${'f'.repeat(64)}`,
          tier: 'stm',
          content: 'unauthorized',
          mode: 'append',
          tags: [],
          metadata: {},
          idempotencyKey: 'cross-namespace',
        },
      }),
    ).rejects.toMatchObject({
      code: 'NAMESPACE_UNAUTHORIZED',
    });

    expect(
      await documentStore.query(`external:stm:${CLIENT_HASH}:default`, {}),
    ).toEqual([]);
  });

  it('quarantines one source for durable mutations and purges only that source collections', async () => {
    const { documentStore, service, subject } = createService();
    const otherNamespace = `app:${'9'.repeat(64)}`;

    await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440011',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'quarantine me',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'quarantine-target',
      },
    });
    await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440012',
      subject: {
        ...subject,
        clientIdHash: '9'.repeat(64),
        namespace: otherNamespace,
      },
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: otherNamespace,
        tier: 'stm',
        content: 'leave me alone',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'other-source',
      },
    });

    const quarantined = await service.quarantineSource(subject.namespace, 'policy hold');
    expect(quarantined.lifecycleState).toBe('quarantined');

    await expect(
      service.put({
        requestId: '550e8400-e29b-41d4-a716-446655440013',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: subject.namespace,
          tier: 'stm',
          content: 'blocked write',
          mode: 'append',
          tags: [],
          metadata: {},
          idempotencyKey: 'blocked-after-quarantine',
        },
      }),
    ).rejects.toMatchObject({
      code: 'SOURCE_QUARANTINED',
    });

    const purge = await service.purgeSource(subject.namespace);
    expect(purge.purgedCollections).toContain(
      `external:stm:${CLIENT_HASH}:default`,
    );

    expect(
      await documentStore.query(`external:stm:${CLIENT_HASH}:default`, {}),
    ).toEqual([]);
    expect(
      await documentStore.query(`external:stm:${'9'.repeat(64)}:default`, {}),
    ).toHaveLength(1);
  });
});
