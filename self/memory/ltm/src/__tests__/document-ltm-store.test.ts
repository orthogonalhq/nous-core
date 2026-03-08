import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import type { DistilledPattern, MemoryEntry } from '@nous/shared';
import {
  DocumentLtmStore,
  MEMORY_ENTRY_COLLECTION,
} from '../index.js';

function createTempDbPath(): string {
  return join(tmpdir(), `nous-ltm-store-${randomUUID()}.sqlite`);
}

function createEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const now = overrides.createdAt ?? '2026-03-06T20:30:00.000Z';
  return {
    id: (overrides.id ?? randomUUID()) as any,
    content: overrides.content ?? 'User prefers concise responses',
    type: overrides.type ?? 'preference',
    scope: overrides.scope ?? 'project',
    projectId: overrides.projectId ?? (randomUUID() as any),
    confidence: overrides.confidence ?? 0.9,
    sensitivity: overrides.sensitivity ?? [],
    retention: overrides.retention ?? 'permanent',
    provenance: overrides.provenance ?? {
      traceId: randomUUID() as any,
      source: 'test',
      timestamp: now,
    },
    sentiment: overrides.sentiment,
    tags: overrides.tags ?? ['style'],
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    mutabilityClass: overrides.mutabilityClass ?? 'domain-versioned',
    lifecycleStatus: overrides.lifecycleStatus ?? 'active',
    supersededBy: overrides.supersededBy,
    deletedAt: overrides.deletedAt,
    tombstoneId: overrides.tombstoneId,
    placementState: overrides.placementState ?? 'project',
    lastMutationId: overrides.lastMutationId,
    embedding: overrides.embedding,
    context: overrides.context,
    action: overrides.action,
    outcome: overrides.outcome,
    reason: overrides.reason,
  };
}

function createPattern(overrides: Partial<DistilledPattern> = {}): DistilledPattern {
  const base = createEntry({
    ...overrides,
    type: 'distilled-pattern',
    tags: overrides.tags ?? ['pattern'],
  });

  return {
    ...base,
    type: 'distilled-pattern',
    basedOn: overrides.basedOn ?? [randomUUID() as any, randomUUID() as any],
    supersedes: overrides.supersedes ?? [randomUUID() as any],
    evidenceRefs: overrides.evidenceRefs ?? [{ actionCategory: 'memory-write' }],
  };
}

describe('DocumentLtmStore', () => {
  let documentStore: SqliteDocumentStore;
  let ltmStore: DocumentLtmStore;

  beforeEach(() => {
    documentStore = new SqliteDocumentStore(createTempDbPath());
    ltmStore = new DocumentLtmStore(documentStore, {
      now: () => '2026-03-06T20:30:00.000Z',
    });
  });

  it('reads legacy entries with schema defaults and filters active entries by default', async () => {
    const projectId = randomUUID();
    const legacyId = randomUUID();
    await documentStore.put(MEMORY_ENTRY_COLLECTION, legacyId, {
      id: legacyId,
      content: 'Legacy fact',
      type: 'fact',
      scope: 'project',
      projectId,
      confidence: 0.8,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'legacy',
        timestamp: '2026-03-06T20:30:00.000Z',
      },
      tags: ['legacy'],
      createdAt: '2026-03-06T20:30:00.000Z',
      updatedAt: '2026-03-06T20:30:00.000Z',
    });
    await ltmStore.write(
      createEntry({
        projectId: projectId as any,
        lifecycleStatus: 'superseded',
        updatedAt: '2026-03-06T20:31:00.000Z',
      }),
    );

    const legacy = await ltmStore.read(legacyId as any);
    expect(legacy?.mutabilityClass).toBe('domain-versioned');
    expect(legacy?.lifecycleStatus).toBe('active');

    const activeOnly = await ltmStore.query({ projectId: projectId as any });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.id).toBe(legacyId);
  });

  it('includes superseded and deleted entries only when explicitly requested', async () => {
    const projectId = randomUUID();
    await ltmStore.write(
      createEntry({ projectId: projectId as any, content: 'active' }),
    );
    await ltmStore.write(
      createEntry({
        projectId: projectId as any,
        content: 'superseded',
        lifecycleStatus: 'superseded',
        supersededBy: randomUUID() as any,
        updatedAt: '2026-03-06T20:31:00.000Z',
      }),
    );
    await ltmStore.write(
      createEntry({
        projectId: projectId as any,
        content: 'soft-deleted',
        lifecycleStatus: 'soft-deleted',
        deletedAt: '2026-03-06T20:32:00.000Z',
        updatedAt: '2026-03-06T20:32:00.000Z',
      }),
    );

    const activeOnly = await ltmStore.query({ projectId: projectId as any });
    expect(activeOnly.map((entry) => entry.content)).toEqual(['active']);

    const expanded = await ltmStore.query({
      projectId: projectId as any,
      includeSuperseded: true,
      includeDeleted: true,
    });
    expect(expanded.map((entry) => entry.content)).toEqual([
      'active',
      'superseded',
      'soft-deleted',
    ]);
  });

  it('preserves distilled-pattern fields on write, read, and query', async () => {
    const projectId = randomUUID() as any;
    const pattern = createPattern({
      projectId,
      content: 'Prefer release windows with explicit rollback notes',
    });

    await ltmStore.write(pattern);

    const loaded = await ltmStore.read(pattern.id);
    expect(loaded?.type).toBe('distilled-pattern');
    expect(loaded).toMatchObject({
      id: pattern.id,
      basedOn: pattern.basedOn,
      supersedes: pattern.supersedes,
      evidenceRefs: pattern.evidenceRefs,
    });

    const queried = await ltmStore.query({
      projectId,
      type: 'distilled-pattern',
    });
    expect(queried).toHaveLength(1);
    expect(queried[0]).toMatchObject({
      id: pattern.id,
      basedOn: pattern.basedOn,
      supersedes: pattern.supersedes,
      evidenceRefs: pattern.evidenceRefs,
    });
  });

  it('marks superseded entries and appends audit records with increasing sequence', async () => {
    const source = createEntry();
    const replacementId = randomUUID() as any;
    await ltmStore.write(source);

    await ltmStore.markSuperseded([source.id], replacementId);
    await ltmStore.appendAuditRecord({
      id: randomUUID() as any,
      action: 'create',
      actor: 'pfc',
      outcome: 'applied',
      reasonCode: 'MEM-CREATE-APPLIED',
      reason: 'approved',
      projectId: source.projectId,
      traceId: source.provenance.traceId,
      evidenceRefs: [],
      occurredAt: '2026-03-06T20:30:00.000Z',
    });
    await ltmStore.appendAuditRecord({
      id: randomUUID() as any,
      action: 'soft-delete',
      actor: 'operator',
      outcome: 'applied',
      reasonCode: 'MEM-SOFT-DELETE-APPLIED',
      reason: 'deleted',
      projectId: source.projectId,
      targetEntryId: source.id,
      traceId: source.provenance.traceId,
      evidenceRefs: [],
      occurredAt: '2026-03-06T20:31:00.000Z',
    });

    const updated = await ltmStore.read(source.id);
    expect(updated?.lifecycleStatus).toBe('superseded');
    expect(updated?.supersededBy).toBe(replacementId);

    const audit = await ltmStore.listMutationAudit(source.projectId);
    expect(audit).toHaveLength(2);
    expect(audit[0]?.sequence).toBe(1);
    expect(audit[1]?.sequence).toBe(2);
  });

  it('creates and lists tombstones deterministically', async () => {
    const entry = createEntry();
    await ltmStore.createTombstone({
      id: randomUUID() as any,
      targetEntryId: entry.id,
      targetContentHash: 'a'.repeat(64),
      deletedByMutationId: randomUUID() as any,
      projectId: entry.projectId,
      reason: 'hard delete',
      createdAt: '2026-03-06T20:30:00.000Z',
    });
    await ltmStore.createTombstone({
      id: randomUUID() as any,
      targetEntryId: randomUUID() as any,
      targetContentHash: 'b'.repeat(64),
      deletedByMutationId: randomUUID() as any,
      projectId: entry.projectId,
      reason: 'hard delete 2',
      createdAt: '2026-03-06T20:31:00.000Z',
    });

    const tombstones = await ltmStore.listTombstones(entry.projectId);
    expect(tombstones).toHaveLength(2);
    expect(tombstones[0]?.reason).toBe('hard delete');
    expect(tombstones[1]?.reason).toBe('hard delete 2');
  });
});
