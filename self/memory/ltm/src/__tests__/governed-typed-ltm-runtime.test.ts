import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryVectorStore, SqliteDocumentStore } from '@nous/autonomic-storage';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import type {
  MemoryMutationRequest,
  ProjectConfig,
  ProjectId,
} from '@nous/shared';
import {
  DocumentLtmStore,
  GovernedTypedLtmRuntime,
} from '../index.js';

const MODEL_HASH = 'a'.repeat(64);

function createTempDbPath(): string {
  return join(tmpdir(), `nous-ltm-runtime-${randomUUID()}.sqlite`);
}

function createProjectConfig(
  projectId: ProjectId,
  overrides: Partial<ProjectConfig['memoryAccessPolicy']> = {},
): ProjectConfig {
  return {
    id: projectId,
    name: `Project ${projectId}`,
    type: 'hybrid',
    pfcTier: 0,
    memoryAccessPolicy: {
      canReadFrom: overrides.canReadFrom ?? 'all',
      canBeReadBy: overrides.canBeReadBy ?? 'all',
      inheritsGlobal: overrides.inheritsGlobal ?? true,
    },
    escalationChannels: ['in-app'],
    retrievalBudgetTokens: 500,
    createdAt: '2026-03-06T20:30:00.000Z',
    updatedAt: '2026-03-06T20:30:00.000Z',
  };
}

function createTypedCandidate(projectId?: ProjectId) {
  return {
    content: 'User prefers concise responses',
    type: 'preference' as const,
    scope: 'project' as const,
    projectId,
    confidence: 0.92,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: {
      traceId: randomUUID() as any,
      source: 'test',
      timestamp: '2026-03-06T20:30:00.000Z',
    },
    tags: ['style'],
  };
}

describe('GovernedTypedLtmRuntime', () => {
  let documentStore: SqliteDocumentStore;
  let ltmStore: DocumentLtmStore;

  beforeEach(() => {
    documentStore = new SqliteDocumentStore(createTempDbPath());
    ltmStore = new DocumentLtmStore(documentStore, {
      now: () => '2026-03-06T20:30:00.000Z',
    });
  });

  it('writes typed entries, records audit, and indexes vector metadata', async () => {
    const projectId = randomUUID() as ProjectId;
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder(16);
    const runtime = new GovernedTypedLtmRuntime(ltmStore, {
      idFactory: randomUUID,
      now: () => '2026-03-06T20:30:00.000Z',
      vectorIndexing: {
        vectorStore,
        embedder,
        profile: {
          modelId: 'nous-test-embedder',
          modelVersion: '1.0.0',
          modelHash: MODEL_HASH,
          provider: 'test',
          dimensions: 16,
        },
      },
    });

    const result = await runtime.write({
      candidate: createTypedCandidate(projectId),
      projectId,
      actingProjectId: projectId,
    });

    expect(result.applied).toBe(true);
    expect(result.indexed).toBe(true);
    expect(result.resultingEntryId).toBeTruthy();

    const stored = await ltmStore.read(result.resultingEntryId!);
    expect(stored?.embedding).toHaveLength(16);

    const queryVector = await embedder.embed('User prefers concise responses');
    const matches = await vectorStore.search('memory', queryVector, 10);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(result.resultingEntryId);

    const audit = await ltmStore.listMutationAudit(projectId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('create');
    expect(audit[0]?.outcome).toBe('applied');
  });

  it('denies governed global writes when project policy blocks global inheritance', async () => {
    const actingProjectId = randomUUID() as ProjectId;
    const projectConfigs = new Map<ProjectId, ProjectConfig>([
      [
        actingProjectId,
        createProjectConfig(actingProjectId, { inheritsGlobal: false }),
      ],
    ]);
    const runtime = new GovernedTypedLtmRuntime(ltmStore, {
      idFactory: randomUUID,
      now: () => '2026-03-06T20:30:00.000Z',
      policy: {
        policyEngine: new MemoryAccessPolicyEngine(),
        projectStore: {
          async get(id) {
            return projectConfigs.get(id) ?? null;
          },
        },
      },
    });

    const result = await runtime.write({
      candidate: {
        ...createTypedCandidate(),
        scope: 'global',
      },
      actingProjectId,
    });

    expect(result.applied).toBe(false);
    expect(result.policyDecision?.action).toBe('write');
    expect(result.policyDecision?.reasonCode).toBe('POL-GLOBAL-DENIED');

    const audit = await ltmStore.listMutationAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.outcome).toBe('denied');
    expect(audit[0]?.reason).toContain('POL-GLOBAL-DENIED');
  });

  it('supersedes active entries and links the previous version', async () => {
    const projectId = randomUUID() as ProjectId;
    const runtime = new GovernedTypedLtmRuntime(ltmStore, {
      idFactory: randomUUID,
      now: () => '2026-03-06T20:30:00.000Z',
    });

    const initial = await runtime.write({
      candidate: createTypedCandidate(projectId),
      projectId,
      actingProjectId: projectId,
    });
    const supersede = await runtime.mutate({
      action: 'supersede',
      actor: 'operator',
      projectId,
      targetEntryId: initial.resultingEntryId,
      replacementCandidate: {
        ...createTypedCandidate(projectId),
        content: 'User prefers direct responses',
      },
      reason: 'operator supersede',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });

    expect(supersede.applied).toBe(true);
    expect(supersede.resultingEntryId).toBeTruthy();

    const original = await ltmStore.read(initial.resultingEntryId!);
    const replacement = await ltmStore.read(supersede.resultingEntryId!);
    expect(original?.lifecycleStatus).toBe('superseded');
    expect(original?.supersededBy).toBe(supersede.resultingEntryId);
    expect(replacement?.lifecycleStatus).toBe('active');
  });

  it('uses the mutation guard for hard delete and creates tombstones on approval', async () => {
    const projectId = randomUUID() as ProjectId;
    const mutationGuard = async (request: MemoryMutationRequest) => {
      if (request.action === 'hard-delete' && request.actor !== 'principal') {
        return {
          approved: false,
          reason: 'hard delete requires principal override',
          reasonCode: 'MEM-HARD-DELETE-REQUIRES-OVERRIDE',
        };
      }
      return {
        approved: true,
        reason: 'approved',
        reasonCode: 'MEM-APPROVED',
      };
    };
    const runtime = new GovernedTypedLtmRuntime(ltmStore, {
      idFactory: randomUUID,
      now: () => '2026-03-06T20:30:00.000Z',
      mutationGuard,
    });

    const initial = await runtime.write({
      candidate: createTypedCandidate(projectId),
      projectId,
      actingProjectId: projectId,
    });
    const denied = await runtime.mutate({
      action: 'hard-delete',
      actor: 'operator',
      projectId,
      targetEntryId: initial.resultingEntryId,
      reason: 'operator delete',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });
    expect(denied.applied).toBe(false);

    const applied = await runtime.mutate({
      action: 'hard-delete',
      actor: 'principal',
      projectId,
      targetEntryId: initial.resultingEntryId,
      reason: 'principal delete',
      traceId: randomUUID() as any,
      evidenceRefs: [],
    });
    expect(applied.applied).toBe(true);
    expect(applied.tombstoneId).toBeTruthy();

    const deleted = await ltmStore.read(initial.resultingEntryId!);
    const tombstones = await ltmStore.listTombstones(projectId);
    expect(deleted?.lifecycleStatus).toBe('hard-deleted');
    expect(deleted?.content).toBe('[hard-deleted]');
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.id).toBe(applied.tombstoneId);
  });
});
