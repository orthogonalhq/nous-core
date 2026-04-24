/**
 * Phase 6.1 — Policy leakage regression tests.
 *
 * Verifies: no cross-project results when policy denies; inner.retrieve not called
 * when policy denies; no hidden cross-project joins when scope is project-only.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  PolicyEnforcedRetrievalEngine,
  MemoryAccessPolicyEngine,
} from '../index.js';
import type {
  IRetrievalEngine,
  IProjectStore,
  RetrievalQuery,
  RetrievalResult,
  ProjectConfig,
  ProjectId,
} from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY, ProjectIdSchema } from '@nous/shared';

const FROM_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const TARGET_ID = ProjectIdSchema.parse('660e8400-e29b-41d4-a716-446655440001');

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

function createResult(projectId: ProjectId): RetrievalResult {
  return {
    entry: {
      id: `mem-${projectId}-1` as any,
      content: 'test',
      type: 'fact',
      scope: 'project',
      projectId,
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

describe('Phase 6.1 — policy leakage regression', () => {
  it('inner.retrieve never called when policy denies targetProjectIds', async () => {
    const inner: IRetrievalEngine = {
      retrieve: vi.fn().mockResolvedValue({ results: [createResult(TARGET_ID)] }),
    };
    const store: IProjectStore = {
      create: vi.fn(),
      get: vi.fn().mockImplementation(async (id: ProjectId) => {
        if (id === FROM_ID) return createProjectConfig(FROM_ID);
        if (id === TARGET_ID)
          return createProjectConfig(TARGET_ID, { canBeReadBy: 'none' });
        return null;
      }),
      list: vi.fn(),
      listArchived: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
    };
    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: store,
    });

    const response = await engine.retrieve({
      situation: 'test',
      projectId: FROM_ID,
      tokenBudget: 100,
      targetProjectIds: [TARGET_ID],
    });

    expect(response.results).toHaveLength(0);
    expect(response.policyDenial).toBeDefined();
    expect(response.policyDenial!.outcome).toBe('denied');
    expect(inner.retrieve).not.toHaveBeenCalled();
  });

  it('response.results empty and policyDenial present when policy denies', async () => {
    const inner = {
      retrieve: vi.fn().mockResolvedValue({ results: [createResult(TARGET_ID)] }),
    };
    const store: IProjectStore = {
      create: vi.fn(),
      get: vi.fn().mockImplementation(async (id: ProjectId) => {
        if (id === FROM_ID) return createProjectConfig(FROM_ID, { canReadFrom: 'none' });
        if (id === TARGET_ID) return createProjectConfig(TARGET_ID);
        return null;
      }),
      list: vi.fn(),
      listArchived: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
    };
    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: store,
    });

    const response = await engine.retrieve({
      situation: 'test',
      projectId: FROM_ID,
      tokenBudget: 100,
      targetProjectIds: [TARGET_ID],
    });

    expect(response.results).toHaveLength(0);
    expect(response.policyDenial).toBeDefined();
    expect(response.policyDenial!.reasonCode).toBe('POL-CANNOT-READ-FROM');
  });

  it('project-only query does not pass targetProjectIds to inner', async () => {
    const capturedQueries: RetrievalQuery[] = [];
    const inner: IRetrievalEngine = {
      retrieve: vi.fn().mockImplementation(async (q: RetrievalQuery) => {
        capturedQueries.push(q);
        return { results: [] };
      }),
    };
    const store: IProjectStore = {
      create: vi.fn(),
      get: vi.fn().mockImplementation(async (id: ProjectId) =>
        id === FROM_ID ? createProjectConfig(FROM_ID) : null
      ),
      list: vi.fn(),
      listArchived: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
    };
    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: store,
    });

    await engine.retrieve({
      situation: 'test',
      projectId: FROM_ID,
      scope: 'project',
      tokenBudget: 100,
    });

    expect(capturedQueries).toHaveLength(1);
    expect(capturedQueries[0].targetProjectIds).toBeUndefined();
  });
});
