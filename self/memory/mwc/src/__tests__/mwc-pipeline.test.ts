/**
 * Unit tests for MwcPipeline.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MwcPipeline, createStubEvaluator } from '../index.js';
import { DocumentStmStore } from '@nous/memory-stm';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import { ValidationError, type ProjectConfig } from '@nous/shared';

function createTempDbPath(): string {
  return join(tmpdir(), `nous-mwc-test-${randomUUID()}.sqlite`);
}

function createValidCandidate(projectId?: string) {
  return {
    content: 'User prefers dark mode',
    type: 'preference' as const,
    scope: 'project' as const,
    projectId: projectId as any,
    confidence: 0.85,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: {
      traceId: randomUUID() as any,
      source: 'model',
      timestamp: new Date().toISOString(),
    },
    tags: ['ui', 'preference'],
  };
}

function createProjectConfig(
  projectId: string,
  inheritsGlobal: boolean,
): ProjectConfig {
  return {
    id: projectId as any,
    name: `Project ${projectId}`,
    type: 'hybrid',
    pfcTier: 0,
    memoryAccessPolicy: {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal,
    },
    escalationChannels: ['in-app'],
    retrievalBudgetTokens: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('MwcPipeline', () => {
  let documentStore: SqliteDocumentStore;
  let stmStore: DocumentStmStore;
  let pipeline: MwcPipeline;
  let projectId: string;

  beforeEach(() => {
    const dbPath = createTempDbPath();
    documentStore = new SqliteDocumentStore(dbPath);
    stmStore = new DocumentStmStore(documentStore);
    pipeline = new MwcPipeline(documentStore, stmStore, createStubEvaluator());
    projectId = randomUUID();
  });

  it('submit with stub evaluator returns MemoryEntryId', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('submit with denying evaluator returns null', async () => {
    const denyingPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      async () => ({ approved: false, reason: 'test deny' }),
    );
    const candidate = createValidCandidate(projectId);
    const id = await denyingPipeline.submit(candidate, projectId as any);
    expect(id).toBeNull();
  });

  it('submit valid candidate persists entry', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].content).toBe(candidate.content);
    expect(entries[0].type).toBe(candidate.type);
    expect(entries[0].projectId).toBe(projectId);
    expect(entries[0].provenance).toEqual(candidate.provenance);
  });

  it('exportForProject returns stm and entries', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    });
    const candidate = createValidCandidate(projectId);
    await pipeline.submit(candidate, projectId as any);

    const result = await pipeline.exportForProject(projectId as any);
    expect(result.stm.entries).toHaveLength(1);
    expect(result.entries).toHaveLength(1);
  });

  it('deleteEntry removes entry', async () => {
    const candidate = createValidCandidate(projectId);
    const id = await pipeline.submit(candidate, projectId as any);
    expect(id).toBeTruthy();

    const deleted = await pipeline.deleteEntry(id!);
    expect(deleted).toBe(true);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(1);
    expect(entries[0].lifecycleStatus).toBe('soft-deleted');
  });

  it('deleteAllForProject clears memory_entries and STM', async () => {
    await stmStore.append(projectId as any, {
      role: 'user',
      content: 'Test',
      timestamp: new Date().toISOString(),
    });
    await pipeline.submit(createValidCandidate(projectId), projectId as any);
    await pipeline.submit(createValidCandidate(projectId), projectId as any);

    const count = await pipeline.deleteAllForProject(projectId as any);
    expect(count).toBe(2);

    const result = await pipeline.exportForProject(projectId as any);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => entry.lifecycleStatus !== 'active')).toBe(
      true,
    );
    expect(result.stm.entries).toHaveLength(0);
  });

  it('submit rejects experience-record candidate missing context', async () => {
    const expCandidateMissingContext = {
      content: 'Kitchen gut rejected',
      type: 'experience-record' as const,
      scope: 'project' as const,
      projectId: projectId as any,
      confidence: 0.85,
      sensitivity: [] as string[],
      retention: 'permanent' as const,
      provenance: {
        traceId: randomUUID() as any,
        source: 'pfc',
        timestamp: new Date().toISOString(),
      },
      tags: ['real-estate'],
      sentiment: 'strong-negative' as const,
      action: 'Submitted for review',
      outcome: 'rejected',
      reason: 'Repair estimate exceeded',
    };

    await expect(
      pipeline.submit(expCandidateMissingContext as any, projectId as any),
    ).rejects.toThrow(ValidationError);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('submit accepts valid experience-record candidate and persists entry with context, action, outcome, reason', async () => {
    const validExpCandidate = {
      content: 'Kitchen gut property rejected',
      type: 'experience-record' as const,
      scope: 'project' as const,
      projectId: projectId as any,
      confidence: 0.85,
      sensitivity: [] as string[],
      retention: 'permanent' as const,
      provenance: {
        traceId: randomUUID() as any,
        source: 'pfc',
        timestamp: new Date().toISOString(),
      },
      tags: ['real-estate'],
      sentiment: 'strong-negative' as const,
      context: '3-bed property, kitchen gut',
      action: 'Submitted for review',
      outcome: 'rejected',
      reason: 'Repair estimate exceeded tolerance',
    };

    const id = await pipeline.submit(validExpCandidate as any, projectId as any);
    expect(id).toBeTruthy();

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].type).toBe('experience-record');
    expect(entries[0].context).toBe(validExpCandidate.context);
    expect(entries[0].action).toBe(validExpCandidate.action);
    expect(entries[0].outcome).toBe(validExpCandidate.outcome);
    expect(entries[0].reason).toBe(validExpCandidate.reason);
    expect(entries[0].sentiment).toBe(validExpCandidate.sentiment);
  });

  it('invalid candidate throws ValidationError before evaluator', async () => {
    const invalidCandidate = {
      content: 'Test',
      type: 'invalid-type' as any,
      scope: 'project',
      confidence: 0.5,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID() as any,
        source: 'test',
        timestamp: new Date().toISOString(),
      },
      tags: [],
    };

    await expect(
      pipeline.submit(invalidCandidate as any, projectId as any),
    ).rejects.toThrow(ValidationError);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('denied candidate does not persist', async () => {
    const denyingPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      async () => ({ approved: false }),
    );
    const candidate = createValidCandidate(projectId);
    await denyingPipeline.submit(candidate, projectId as any);

    const { entries } = await pipeline.exportForProject(projectId as any);
    expect(entries).toHaveLength(0);
  });

  it('exportForProject for project with no entries returns empty', async () => {
    const result = await pipeline.exportForProject(projectId as any);
    expect(result.stm.entries).toHaveLength(0);
    expect(result.entries).toHaveLength(0);
  });

  it('deleteEntry for non-existent id returns false', async () => {
    const result = await pipeline.deleteEntry(
      '00000000-0000-0000-0000-000000000001' as any,
    );
    expect(result).toBe(false);
  });

  it('supersede mutation links old entry via supersededBy and creates replacement', async () => {
    const originalId = await pipeline.submit(createValidCandidate(projectId), projectId as any);
    expect(originalId).toBeTruthy();

    const result = await pipeline.mutate({
      action: 'supersede',
      actor: 'operator',
      projectId: projectId as any,
      targetEntryId: originalId!,
      replacementCandidate: {
        ...createValidCandidate(projectId),
        content: 'Updated preference',
      },
      reason: 'update preference',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });

    expect(result.applied).toBe(true);
    expect(result.resultingEntryId).toBeTruthy();

    const exported = await pipeline.exportForProject(projectId as any);
    const original = exported.entries.find((entry) => entry.id === originalId);
    const replacement = exported.entries.find(
      (entry) => entry.id === result.resultingEntryId,
    );

    expect(original?.lifecycleStatus).toBe('superseded');
    expect(original?.supersededBy).toBe(result.resultingEntryId);
    expect(replacement?.lifecycleStatus).toBe('active');
  });

  it('hard delete requires principal override and creates tombstone', async () => {
    const entryId = await pipeline.submit(createValidCandidate(projectId), projectId as any);
    expect(entryId).toBeTruthy();

    const denied = await pipeline.mutate({
      action: 'hard-delete',
      actor: 'operator',
      targetEntryId: entryId!,
      projectId: projectId as any,
      reason: 'cleanup',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });
    expect(denied.applied).toBe(false);

    const applied = await pipeline.mutate({
      action: 'hard-delete',
      actor: 'principal',
      targetEntryId: entryId!,
      projectId: projectId as any,
      reason: 'legal erase',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });
    expect(applied.applied).toBe(true);
    expect(applied.tombstoneId).toBeTruthy();

    const exported = await pipeline.exportForProject(projectId as any);
    const entry = exported.entries.find((item) => item.id === entryId);
    expect(entry?.lifecycleStatus).toBe('hard-deleted');
    expect(entry?.tombstoneId).toBe(applied.tombstoneId);
    expect(entry?.content).toBe('[hard-deleted]');
    expect(exported.tombstones).toHaveLength(1);
  });

  it('supports compatibility defaults for legacy entry records on export', async () => {
    const legacyId = randomUUID();
    await documentStore.put('memory_entries', legacyId, {
      id: legacyId,
      content: 'legacy',
      type: 'fact',
      scope: 'project',
      projectId,
      confidence: 0.8,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'legacy-test',
        timestamp: new Date().toISOString(),
      },
      tags: ['legacy'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const exported = await pipeline.exportForProject(projectId as any);
    expect(exported.entries).toHaveLength(1);
    expect(exported.entries[0].mutabilityClass).toBe('domain-versioned');
    expect(exported.entries[0].lifecycleStatus).toBe('active');
  });

  it('emits mutation audit records with increasing sequence order', async () => {
    await pipeline.submit(createValidCandidate(projectId), projectId as any);
    await pipeline.submit(
      { ...createValidCandidate(projectId), content: 'another' },
      projectId as any,
    );

    const audit = await pipeline.listMutationAudit(projectId as any);
    expect(audit.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < audit.length; i++) {
      expect(audit[i].sequence).toBeGreaterThan(audit[i - 1].sequence);
    }
  });

  it('denies governed global typed writes through the delegated policy runtime', async () => {
    const actingProjectId = randomUUID();
    const governedPipeline = new MwcPipeline(
      documentStore,
      stmStore,
      createStubEvaluator(),
      undefined,
      {
        policy: {
          policyEngine: new MemoryAccessPolicyEngine(),
          projectStore: {
            async get(id) {
              if (id === actingProjectId) {
                return createProjectConfig(id, false);
              }
              return null;
            },
          },
        },
      },
    );

    const id = await governedPipeline.submit(
      {
        ...createValidCandidate(),
        scope: 'global',
      },
      actingProjectId as any,
    );

    expect(id).toBeNull();
    const audit = await governedPipeline.listMutationAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0].outcome).toBe('denied');
    expect(audit[0].reason).toContain('POL-GLOBAL-DENIED');
  });
});
