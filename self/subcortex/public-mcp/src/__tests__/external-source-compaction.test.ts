import { describe, expect, it } from 'vitest';
import type { PublicMcpSubject } from '@nous/shared';
import { ExternalSourceMemoryService } from '../external-source-memory-service.js';
import { ExternalSourceStorageAdapter } from '../external-source-storage-adapter.js';
import { NamespaceRegistryStore } from '../namespace-registry-store.js';
import { QuotaUsageStore } from '../quota-usage-store.js';
import { RateLimitBucketStore } from '../rate-limit-bucket-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const CLIENT_HASH =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const TOKEN_FINGERPRINT =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const NAMESPACE = `app:${CLIENT_HASH}`;

function createService() {
  const documentStore = createMemoryDocumentStore();
  let sequence = 0;
  const nextId = () => `cmp-${++sequence}`;
  const now = () => '2026-03-14T00:00:00.000Z';
  const service = new ExternalSourceMemoryService({
    documentStore,
    namespaceStore: new NamespaceRegistryStore(documentStore, { now }),
    storageAdapter: new ExternalSourceStorageAdapter(documentStore),
    quotaStore: new QuotaUsageStore(documentStore),
    rateLimitStore: new RateLimitBucketStore(documentStore),
    now,
    idFactory: nextId,
  });

  return {
    documentStore,
    service,
    subject: {
      class: 'ExternalClient' as const,
      clientId: 'client-2',
      clientIdHash: CLIENT_HASH,
      tokenFingerprint: TOKEN_FINGERPRINT,
      namespace: NAMESPACE,
      scopes: [
        'ortho.memory.stm.read',
        'ortho.memory.stm.write',
        'ortho.memory.ltm.read',
        'ortho.memory.ltm.write',
      ],
      audience: 'urn:nous:ortho:mcp',
    } satisfies PublicMcpSubject,
  };
}

describe('ExternalSourceMemoryService compaction', () => {
  it('supports summarize and extract_facts without touching internal or promoted collections', async () => {
    const { documentStore, service, subject } = createService();

    await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440020',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'First fact. Second fact.',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'seed-1',
      },
    });
    await service.put({
      requestId: '550e8400-e29b-41d4-a716-446655440021',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        tier: 'stm',
        content: 'Third fact.',
        mode: 'append',
        tags: [],
        metadata: {},
        idempotencyKey: 'seed-2',
      },
    });

    const summary = await service.compact({
      requestId: '550e8400-e29b-41d4-a716-446655440022',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        sourceTier: 'stm',
        strategy: 'summarize',
        maxEntries: 10,
        idempotencyKey: 'compact-summary',
      },
    });
    const facts = await service.compact({
      requestId: '550e8400-e29b-41d4-a716-446655440023',
      subject,
      requestedAt: '2026-03-14T00:00:00.000Z',
      arguments: {
        namespace: subject.namespace,
        sourceTier: 'stm',
        strategy: 'extract_facts',
        maxEntries: 10,
        idempotencyKey: 'compact-facts',
      },
    });

    const stmRows = await documentStore.query<Record<string, unknown>>(
      `external:stm:${CLIENT_HASH}:default`,
      {},
    );
    const ltmRows = await documentStore.query<Record<string, unknown>>(
      `external:ltm:${CLIENT_HASH}:default`,
      {},
    );

    expect(summary.strategy).toBe('summarize');
    expect(summary.derivedEntryIds).toHaveLength(1);
    expect(facts.strategy).toBe('extract_facts');
    expect(facts.derivedEntryIds.length).toBeGreaterThan(0);
    expect(stmRows.some((row) => row.id === summary.derivedEntryIds[0])).toBe(true);
    expect(
      ltmRows.filter((row) => facts.derivedEntryIds.includes(String(row.id))).length,
    ).toBe(facts.derivedEntryIds.length);
    expect(await documentStore.query('memory_entries', {})).toEqual([]);
    expect(await documentStore.query('promoted:ltm', {})).toEqual([]);
  });
});
