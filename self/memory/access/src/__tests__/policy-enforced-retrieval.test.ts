/**
 * PolicyEnforcedRetrievalEngine tests.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PolicyEnforcedRetrievalEngine,
  MemoryAccessPolicyEngine,
} from '../index.js';
import type {
  IRetrievalEngine,
  IProjectStore,
  RetrievalResult,
  ProjectConfig,
  ProjectId,
} from '@nous/shared';
import {
  DEFAULT_MEMORY_ACCESS_POLICY,
  DEFAULT_RETRIEVAL_WEIGHTS,
  ProjectIdSchema,
  RETRIEVAL_TIE_BREAK_STRATEGY,
} from '@nous/shared';

const FROM_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

function createProjectConfig(
  id: ProjectId,
  overrides?: Partial<ProjectConfig['memoryAccessPolicy']>
): ProjectConfig {
  return {
    id,
    name: 'Test',
    type: 'protocol',
    pfcTier: 0,
    memoryAccessPolicy: overrides
      ? { ...DEFAULT_MEMORY_ACCESS_POLICY, ...overrides }
      : DEFAULT_MEMORY_ACCESS_POLICY,
    escalationChannels: [],
    retrievalBudgetTokens: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createResult(
  projectId: ProjectId,
  scope: 'global' | 'project' = 'project'
): RetrievalResult {
  return {
    entry: {
      id: `mem-${projectId}-1` as any,
      content: 'test',
      type: 'fact',
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      confidence: 0.9,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: 'trace-1' as any,
        source: 'test',
        timestamp: new Date().toISOString(),
      },
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    score: 0.9,
    components: { similarity: 0.9, sentimentWeight: 0.5, recency: 0.8, confidence: 0.9 },
  };
}

function createInner(results: RetrievalResult[]): IRetrievalEngine {
  return {
    retrieve: vi.fn().mockResolvedValue({
      results,
      budgetTelemetry: {
        consumedTokens: results.length,
        candidateCount: results.length,
        truncatedCount: 0,
      },
      decision: {
        vectorCandidateCount: results.length,
        scoredCandidateCount: results.length,
        returnedCount: results.length,
        truncationReason: 'none',
        tieBreakStrategy: RETRIEVAL_TIE_BREAK_STRATEGY,
        scoringWeights: DEFAULT_RETRIEVAL_WEIGHTS,
      },
    }),
  };
}

function createProjectStore(configs: Map<string, ProjectConfig>): IProjectStore {
  return {
    create: vi.fn(),
    get: vi.fn().mockImplementation(async (id: ProjectId) => configs.get(id) ?? null),
    list: vi.fn(),
    listArchived: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
  };
}

describe('PolicyEnforcedRetrievalEngine', () => {
  describe('Tier 1 — Contract', () => {
    it('implements IRetrievalEngine and delegates when policy allows', async () => {
      const inner = createInner([createResult(FROM_ID)]);
      const store = createProjectStore(
        new Map([
          [FROM_ID, createProjectConfig(FROM_ID)],
        ])
      );
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        projectId: FROM_ID,
        scope: 'project',
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(1);
      expect(response.policyDenial).toBeUndefined();
      expect(response.decision?.returnedCount).toBe(1);
      expect(response.budgetTelemetry?.candidateCount).toBe(1);
      expect(inner.retrieve).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tier 2 — Behavior', () => {
    it('returns [] when projectId is missing', async () => {
      const inner = createInner([createResult(FROM_ID)]);
      const store = createProjectStore(new Map([[FROM_ID, createProjectConfig(FROM_ID)]]));
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(0);
      expect(response.policyDenial).toBeUndefined();
      expect(response.decision?.truncationReason).toBe('none');
      expect(inner.retrieve).not.toHaveBeenCalled();
    });

    it('returns [] when project config is missing', async () => {
      const inner = createInner([createResult(FROM_ID)]);
      const store = createProjectStore(new Map());
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        projectId: FROM_ID,
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(0);
      expect(inner.retrieve).not.toHaveBeenCalled();
    });

    it('returns [] when includeGlobal true but inheritsGlobal false', async () => {
      const inner = createInner([createResult(FROM_ID, 'global')]);
      const store = createProjectStore(
        new Map([[FROM_ID, createProjectConfig(FROM_ID, { inheritsGlobal: false })]])
      );
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        projectId: FROM_ID,
        scope: 'global',
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(0);
      expect(response.policyDenial).toBeDefined();
      expect(response.decision?.truncationReason).toBe('policy_denied');
      expect(inner.retrieve).not.toHaveBeenCalled();
    });

    it('delegates and returns results when inheritsGlobal true', async () => {
      const inner = createInner([createResult(FROM_ID, 'global')]);
      const store = createProjectStore(
        new Map([[FROM_ID, createProjectConfig(FROM_ID, { inheritsGlobal: true })]])
      );
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        projectId: FROM_ID,
        scope: 'global',
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].entry.scope).toBe('global');
      expect(response.decision?.returnedCount).toBe(1);
    });

    it('filters out global results when inheritsGlobal false', async () => {
      const inner = createInner([
        createResult(FROM_ID, 'project'),
        createResult(FROM_ID, 'global'),
      ]);
      const store = createProjectStore(
        new Map([[FROM_ID, createProjectConfig(FROM_ID, { inheritsGlobal: false })]])
      );
      const engine = new PolicyEnforcedRetrievalEngine({
        policyEngine: new MemoryAccessPolicyEngine(),
        inner,
        projectStore: store,
      });

      const response = await engine.retrieve({
        situation: 'test',
        projectId: FROM_ID,
        scope: 'project',
        tokenBudget: 100,
      });

      expect(response.results).toHaveLength(1);
      expect(response.results[0].entry.scope).toBe('project');
      expect(response.budgetTelemetry?.candidateCount).toBe(1);
    });
  });
});
