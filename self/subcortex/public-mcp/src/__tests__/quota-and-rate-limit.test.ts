import { describe, expect, it } from 'vitest';
import type { PublicMcpSubject } from '@nous/shared';
import { ExternalSourceMemoryService } from '../external-source-memory-service.js';
import { ExternalSourceStorageAdapter } from '../external-source-storage-adapter.js';
import { NamespaceRegistryStore } from '../namespace-registry-store.js';
import { QuotaUsageStore } from '../quota-usage-store.js';
import { RateLimitBucketStore } from '../rate-limit-bucket-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const CLIENT_HASH =
  '1111111111111111111111111111111111111111111111111111111111111111';
const TOKEN_FINGERPRINT =
  '2222222222222222222222222222222222222222222222222222222222222222';
const NAMESPACE = `app:${CLIENT_HASH}`;

function createSubject(): PublicMcpSubject {
  return {
    class: 'ExternalClient' as const,
    clientId: 'client-3',
    clientIdHash: CLIENT_HASH,
    tokenFingerprint: TOKEN_FINGERPRINT,
    namespace: NAMESPACE,
    scopes: [
      'ortho.memory.stm.read',
      'ortho.memory.stm.write',
    ],
    audience: 'urn:nous:ortho:mcp',
  };
}

describe('ExternalSourceMemoryService enforcement', () => {
  it('rejects writes after the configured quota is exhausted', async () => {
    const documentStore = createMemoryDocumentStore();
    const now = () => '2026-03-14T00:00:00.000Z';
    const service = new ExternalSourceMemoryService({
      documentStore,
      namespaceStore: new NamespaceRegistryStore(documentStore, { now }),
      storageAdapter: new ExternalSourceStorageAdapter(documentStore),
      quotaStore: new QuotaUsageStore(documentStore),
      rateLimitStore: new RateLimitBucketStore(documentStore),
      quotaLimits: {
        maxReadUnits: 10,
        maxWriteUnits: 1,
        maxBytesReserved: 1024,
      },
      rateLimitMaxRequests: 10,
      now,
      idFactory: (() => {
        let sequence = 0;
        return () => `quota-${++sequence}`;
      })(),
    });
    const subject = createSubject();

    await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440030',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'first write',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'quota-1',
      },
    });

    await expect(
      service.put({
        requestId: '550e8400-e29b-41d4-a716-446655440031',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: subject.namespace,
          tier: 'stm',
          content: 'second write',
          mode: 'append',
          tags: [],
          metadata: {},
          idempotencyKey: 'quota-2',
        },
      }),
    ).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });

  it('rejects repeated requests after the configured rate limit threshold', async () => {
    const documentStore = createMemoryDocumentStore();
    const now = () => '2026-03-14T00:00:00.000Z';
    const service = new ExternalSourceMemoryService({
      documentStore,
      namespaceStore: new NamespaceRegistryStore(documentStore, { now }),
      storageAdapter: new ExternalSourceStorageAdapter(documentStore),
      quotaStore: new QuotaUsageStore(documentStore),
      rateLimitStore: new RateLimitBucketStore(documentStore),
      quotaLimits: {
        maxReadUnits: 10,
        maxWriteUnits: 10,
        maxBytesReserved: 1024,
      },
      rateLimitMaxRequests: 1,
      rateLimitWindowSeconds: 60,
      now,
      idFactory: (() => {
        let sequence = 0;
        return () => `rate-${++sequence}`;
      })(),
    });
    const subject = createSubject();

    await service.search({
      requestId: '550e8400-e29b-41d4-a716-446655440032',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        query: 'anything',
        limit: 10,
        includeDeleted: false,
      },
    });

    await expect(
      service.search({
        requestId: '550e8400-e29b-41d4-a716-446655440033',
        subject,
        requestedAt: '2026-03-14T00:00:00.000Z',
        arguments: {
          namespace: subject.namespace,
          tier: 'stm',
          query: 'anything',
          limit: 10,
          includeDeleted: false,
        },
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});
