/**
 * Integration tests for memory tRPC router with governed mutation flows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocumentLtmStore } from '@nous/memory-ltm';
import type {
  DistilledPattern,
  ExperienceRecord,
  ProjectConfig,
} from '@nous/shared';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig as createProjectConfigFixture } from '../../test-support/project-fixtures';

function createProjectConfig(
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  return createProjectConfigFixture({
    name: 'Memory Router Test Project',
    ...overrides,
  });
}

function createCandidate(
  projectId: import('@nous/shared').ProjectId | undefined,
  content: string,
  overrides: Partial<{
    type: 'fact' | 'preference' | 'experience-record' | 'distilled-pattern' | 'task-state';
    scope: 'project' | 'global';
    confidence: number;
    tags: string[];
    sentiment: 'strong-positive' | 'weak-positive' | 'neutral' | 'weak-negative' | 'strong-negative';
    context: string;
    action: string;
    outcome: string;
    reason: string;
  }> = {},
) {
  return {
    content,
    type: overrides.type ?? ('preference' as const),
    scope: overrides.scope ?? ('project' as const),
    projectId,
    confidence: overrides.confidence ?? 0.9,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: {
      traceId: randomUUID() as import('@nous/shared').TraceId,
      source: 'memory-router-test',
      timestamp: new Date().toISOString(),
    },
    tags: overrides.tags ?? ['router-test'],
    sentiment: overrides.sentiment,
    context: overrides.context,
    action: overrides.action,
    outcome: overrides.outcome,
    reason: overrides.reason,
  };
}

function createExperienceRecord(projectId: import('@nous/shared').ProjectId): ExperienceRecord {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID() as any,
    content: 'Release review confirms the guarded rollout stayed predictable',
    type: 'experience-record',
    scope: 'project',
    projectId,
    confidence: 0.86,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: randomUUID() as any,
      source: 'learning-router-test',
      timestamp,
    },
    sentiment: 'strong-positive',
    tags: ['learning', 'release'],
    createdAt: timestamp,
    updatedAt: timestamp,
    mutabilityClass: 'domain-versioned',
    lifecycleStatus: 'active',
    placementState: 'project',
    context: 'release train with rollback notes',
    action: 'deploy guarded release',
    outcome: 'positive operator confidence',
    reason: 'rollback posture remained explicit',
  };
}

function createDistilledPattern(
  projectId: import('@nous/shared').ProjectId,
  sourceIds: import('@nous/shared').MemoryEntryId[],
): DistilledPattern {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID() as any,
    content: 'Patterns with explicit rollback notes preserve operator trust',
    type: 'distilled-pattern',
    scope: 'project',
    projectId,
    confidence: 0.93,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: randomUUID() as any,
      source: 'learning-router-test',
      timestamp,
    },
    tags: ['learning', 'pattern'],
    createdAt: timestamp,
    updatedAt: timestamp,
    mutabilityClass: 'domain-versioned',
    lifecycleStatus: 'active',
    placementState: 'project',
    basedOn: sourceIds,
    supersedes: sourceIds,
    evidenceRefs: [{ actionCategory: 'memory-write' }],
  };
}

describe('memory router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-memory-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('soft delete routes through governed mutation and records audit entries', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const entryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'soft delete me'),
      projectId,
    );
    expect(entryId).toBeTruthy();

    const deletion = await caller.memory.delete({ id: entryId! });
    expect(deletion.deleted).toBe(1);

    const list = await caller.memory.list({ projectId });
    expect(list).toHaveLength(1);
    expect(list[0].lifecycleStatus).toBe('soft-deleted');

    const audit = await caller.memory.audit({ projectId });
    expect(
      audit.some(
        (item) => item.action === 'soft-delete' && item.outcome === 'applied',
      ),
    ).toBe(true);
  });

  it('hard delete requires rationale and emits tombstone', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const entryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'hard delete me'),
      projectId,
    );
    expect(entryId).toBeTruthy();

    const denied = await caller.memory.delete({ id: entryId!, hard: true });
    expect(denied.deleted).toBe(0);

    const approved = await caller.memory.delete({
      id: entryId!,
      hard: true,
      rationale: 'principal approved erase',
    });
    expect(approved.deleted).toBe(1);

    const list = await caller.memory.list({ projectId });
    expect(list[0].lifecycleStatus).toBe('hard-deleted');
    expect(list[0].tombstoneId).toBeTruthy();
    expect(list[0].content).toBe('[hard-deleted]');

    const tombstones = await caller.memory.tombstones({ projectId });
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].targetEntryId).toBe(entryId);
  });

  it('supersede mutation updates lineage using supersededBy', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const oldEntryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'original content'),
      projectId,
    );
    expect(oldEntryId).toBeTruthy();

    const replacement = createCandidate(projectId, 'replacement content');
    const result = await caller.memory.supersede({
      id: oldEntryId!,
      replacement,
      projectId,
    });
    expect(result.applied).toBe(true);
    expect(result.resultingEntryId).toBeTruthy();

    const list = await caller.memory.list({ projectId });
    const original = list.find((entry) => entry.id === oldEntryId);
    const next = list.find((entry) => entry.id === result.resultingEntryId);

    expect(original?.lifecycleStatus).toBe('superseded');
    expect(original?.supersededBy).toBe(result.resultingEntryId);
    expect(next?.lifecycleStatus).toBe('active');
  });

  it('inspect returns deterministic filtered results across project and global scopes', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());

    const projectFactId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'Project fact for inspection', {
        type: 'fact',
        tags: ['facts'],
      }),
      projectId,
    );
    const experienceId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'Deployment succeeded after rollout review', {
        type: 'experience-record',
        tags: ['release'],
        sentiment: 'strong-positive',
        context: 'release train',
        action: 'deploy feature set',
        outcome: 'approved and shipped',
        reason: 'smooth rollout',
      }),
      projectId,
    );
    const supersededId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'Legacy preference', {
        tags: ['legacy'],
      }),
      projectId,
    );
    const deletedId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'Temporary note', {
        tags: ['temporary'],
      }),
      projectId,
    );
    const globalId = await ctx.mwcPipeline.submit(
      createCandidate(undefined, 'Global operating rule', {
        type: 'fact',
        scope: 'global',
        tags: ['global'],
      }),
      projectId,
    );

    expect(projectFactId).toBeTruthy();
    expect(experienceId).toBeTruthy();
    expect(supersededId).toBeTruthy();
    expect(deletedId).toBeTruthy();
    expect(globalId).toBeTruthy();

    await caller.memory.supersede({
      id: supersededId!,
      replacement: createCandidate(projectId, 'Replacement preference', {
        tags: ['replacement'],
      }),
      projectId,
    });
    await caller.memory.delete({ id: deletedId! });

    const defaultInspection = await caller.memory.inspect({
      projectId,
      scope: 'all',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(defaultInspection.diagnostics.projectInheritsGlobal).toBe(true);
    expect(defaultInspection.entries.some((entry) => entry.id === projectFactId)).toBe(
      true,
    );
    expect(defaultInspection.entries.some((entry) => entry.id === experienceId)).toBe(
      true,
    );
    expect(defaultInspection.entries.some((entry) => entry.id === globalId)).toBe(true);
    expect(defaultInspection.entries.some((entry) => entry.id === supersededId)).toBe(
      false,
    );
    expect(defaultInspection.entries.some((entry) => entry.id === deletedId)).toBe(
      false,
    );

    const searchInspection = await caller.memory.inspect({
      projectId,
      scope: 'all',
      query: 'smooth rollout',
      types: ['experience-record'],
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(searchInspection.entries).toHaveLength(1);
    expect(searchInspection.entries[0].id).toBe(experienceId);

    const deletedInspection = await caller.memory.inspect({
      projectId,
      scope: 'project',
      includeDeleted: true,
      tags: ['temporary'],
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(deletedInspection.entries).toHaveLength(1);
    expect(deletedInspection.entries[0].id).toBe(deletedId);
    expect(deletedInspection.entries[0].lifecycleStatus).toBe('soft-deleted');
  });

  it('inspect returns explicit diagnostics when global scope is unavailable', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const sourceProjectId = await ctx.projectStore.create(createProjectConfig());
    const projectId = await ctx.projectStore.create(
      createProjectConfig({
        memoryAccessPolicy: {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: false,
        },
      }),
    );

    await ctx.mwcPipeline.submit(
      createCandidate(undefined, 'Global memory that should stay hidden', {
        type: 'fact',
        scope: 'global',
        tags: ['global'],
      }),
      sourceProjectId,
    );
    const projectEntryId = await ctx.mwcPipeline.submit(
      createCandidate(projectId, 'Project-local memory remains visible', {
        tags: ['local'],
      }),
      projectId,
    );

    const allScope = await caller.memory.inspect({
      projectId,
      scope: 'all',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(allScope.diagnostics.projectInheritsGlobal).toBe(false);
    expect(allScope.diagnostics.globalScopeDecision?.reasonCode).toBe(
      'POL-GLOBAL-DENIED',
    );
    expect(allScope.entries).toHaveLength(1);
    expect(allScope.entries[0].id).toBe(projectEntryId);

    const globalScope = await caller.memory.inspect({
      projectId,
      scope: 'global',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });
    expect(globalScope.entries).toHaveLength(0);
    expect(globalScope.diagnostics.globalScopeDecision?.reasonCode).toBe(
      'POL-GLOBAL-DENIED',
    );
  });

  it('denials preserves decision records and trace metadata', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const traceId = randomUUID() as import('@nous/shared').TraceId;
    const timestamp = new Date().toISOString();

    await ctx.documentStore.put('execution_traces', traceId, {
      traceId,
      projectId,
      startedAt: timestamp,
      turns: [
        {
          input: 'remember this',
          output: 'noted',
          modelCalls: [],
          pfcDecisions: [],
          toolDecisions: [],
          memoryWrites: [],
          memoryDenials: [
            {
              candidate: createCandidate(projectId, 'Denied candidate'),
              reason: 'Global write denied',
              decisionRecord: {
                id: randomUUID(),
                projectId,
                action: 'write',
                outcome: 'denied',
                reasonCode: 'POL-GLOBAL-DENIED',
                reason: 'inheritsGlobal is false; global access denied',
                traceId,
                evidenceRefs: [],
                occurredAt: timestamp,
              },
            },
          ],
          evidenceRefs: [],
          timestamp,
        },
      ],
    });

    const denials = await caller.memory.denials({ projectId });
    expect(denials).toHaveLength(1);
    expect(denials[0].reason).toBe('Global write denied');
    expect(denials[0].traceId).toBe(traceId);
    expect(denials[0].timestamp).toBe(timestamp);
    expect(denials[0].decisionRecord?.reasonCode).toBe('POL-GLOBAL-DENIED');
    expect(denials[0].candidate.content).toBe('Denied candidate');
  });

  it('learningOverview returns typed pattern summaries with confidence and lineage diagnostics', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const ltmStore = new DocumentLtmStore(ctx.documentStore);
    const firstSource = createExperienceRecord(projectId);
    const secondSource = createExperienceRecord(projectId);
    const pattern = createDistilledPattern(projectId, [
      firstSource.id,
      secondSource.id,
    ]);

    await ltmStore.write(firstSource);
    await ltmStore.write(secondSource);
    await ltmStore.write(pattern);

    const overview = await caller.memory.learningOverview({
      projectId,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
      tier: 'all',
      decayState: 'all',
      includeRetired: true,
    });
    expect(overview.items).toHaveLength(1);
    expect(overview.items[0].pattern.id).toBe(pattern.id);
    expect(overview.items[0].pattern.basedOn).toEqual(pattern.basedOn);
    expect(overview.items[0].sourceCount).toBe(2);
    expect(overview.items[0].missingSourceCount).toBe(0);
    expect(overview.items[0].confidenceSignal.supportingSignals).toBe(2);
    expect(overview.items[0].lineageIntegrityStatus).toBe('complete');

    const filtered = await caller.memory.learningOverview({
      projectId,
      query: 'not-present-in-pattern-content',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
      tier: 'all',
      decayState: 'all',
      includeRetired: true,
    });
    expect(filtered.items).toHaveLength(0);
  });

  it('learningDetail derives lifecycle events and representative governance cards from canonical contracts', async () => {
    const ctx = createNousContext();
    ctx.opctlService.getProjectControlState = async () => 'paused_review';
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const ltmStore = new DocumentLtmStore(ctx.documentStore);
    const source = createExperienceRecord(projectId);
    const pattern = createDistilledPattern(projectId, [source.id]);

    await ltmStore.write(source);
    await ltmStore.write(pattern);

    const detail = await caller.memory.learningDetail({
      projectId,
      patternId: pattern.id,
    });
    expect(detail).toBeTruthy();
    expect(detail?.diagnostics.historicalDecisionLogAvailable).toBe(false);
    expect(detail?.sourceTimeline).toHaveLength(1);
    expect(detail?.lifecycleEvents.some((event) => event.derived)).toBe(true);
    expect(
      detail?.decisionProjections.some(
        (projection) =>
          projection.scenarioId === 'high-risk-memory-write' &&
          projection.evaluation.reasonCode ===
            'CGR-DEFER-HIGH-RISK-CONFIRMATION',
      ),
    ).toBe(true);
    expect(
      detail?.decisionProjections.some(
        (projection) =>
          projection.scenarioId === 'current-control-state' &&
          projection.evaluation.reasonCode === 'CGR-DEFER-PAUSED-REVIEW',
      ),
    ).toBe(true);
  });

  it('learningDetail surfaces missing-source and missing-evidence diagnostics without inventing history', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig());
    const missingSourceId = randomUUID() as import('@nous/shared').MemoryEntryId;
    const patternId = randomUUID() as import('@nous/shared').MemoryEntryId;
    const timestamp = new Date().toISOString();

    await ctx.documentStore.put('memory_entries', patternId, {
      id: patternId,
      content: 'Corrupted pattern missing canonical evidence refs',
      type: 'distilled-pattern',
      scope: 'project',
      projectId,
      confidence: 0.41,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: randomUUID(),
        source: 'learning-router-test',
        timestamp,
      },
      tags: ['learning', 'corrupted'],
      createdAt: timestamp,
      updatedAt: timestamp,
      mutabilityClass: 'domain-versioned',
      lifecycleStatus: 'active',
      placementState: 'project',
      basedOn: [missingSourceId],
      supersedes: [missingSourceId],
    });

    const detail = await caller.memory.learningDetail({
      projectId,
      patternId,
    });
    expect(detail).toBeTruthy();
    expect(detail?.diagnostics.historicalDecisionLogAvailable).toBe(false);
    expect(detail?.diagnostics.missingEvidenceRefs).toBe(true);
    expect(detail?.lineage.missingSourceIds).toEqual([missingSourceId]);
    expect(detail?.lineage.lineageIntegrityStatus).toBe('mixed');
    expect(detail?.decisionProjections).toHaveLength(0);
  });
});
