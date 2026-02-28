/**
 * Phase 6.1 — PolicyEnforcedRetrievalEngine cross-project behavior tests.
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
  ProjectIdSchema,
  DEFAULT_CROSS_PROJECT_SELECTION_POLICY,
} from '@nous/shared';

const FROM_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const TARGET_A = ProjectIdSchema.parse('660e8400-e29b-41d4-a716-446655440001');
const TARGET_B = ProjectIdSchema.parse('770e8400-e29b-41d4-a716-446655440002');

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
  content = 'test',
  scope: 'global' | 'project' = 'project'
): RetrievalResult {
  return {
    entry: {
      id: `mem-${projectId}-1` as any,
      content,
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
    retrieve: vi.fn().mockResolvedValue({ results }),
  };
}

function createProjectStore(configs: Map<string, ProjectConfig>): IProjectStore {
  return {
    create: vi.fn(),
    get: vi.fn().mockImplementation(async (id: ProjectId) => configs.get(id) ?? null),
    list: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };
}

describe('PolicyEnforcedRetrievalEngine — Phase 6.1 cross-project', () => {
  it('returns results and selectionAudit when policy allows targetProjectIds', async () => {
    const inner = createInner([
      createResult(FROM_ID, 'from'),
      createResult(TARGET_A, 'targetA'),
      createResult(TARGET_B, 'targetB'),
    ]);
    const store = createProjectStore(
      new Map([
        [FROM_ID, createProjectConfig(FROM_ID)],
        [TARGET_A, createProjectConfig(TARGET_A)],
        [TARGET_B, createProjectConfig(TARGET_B)],
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
      tokenBudget: 100,
      targetProjectIds: [TARGET_A, TARGET_B],
    });

    expect(response.results).toHaveLength(3);
    expect(response.policyDenial).toBeUndefined();
    expect(response.selectionAudit).toBeDefined();
    expect(response.selectionAudit!.projectIdsQueried).toContain(FROM_ID);
    expect(response.selectionAudit!.projectIdsQueried).toContain(TARGET_A);
    expect(response.selectionAudit!.projectIdsQueried).toContain(TARGET_B);
    expect(response.selectionAudit!.candidateCount).toBe(3);
    expect(response.selectionAudit!.resultCount).toBe(3);
    expect(inner.retrieve).toHaveBeenCalledTimes(1);
  });

  it('returns policyDenial when policy denies one target in targetProjectIds', async () => {
    const inner = createInner([createResult(TARGET_A)]);
    const store = createProjectStore(
      new Map([
        [FROM_ID, createProjectConfig(FROM_ID, { canReadFrom: [TARGET_A] })],
        [TARGET_A, createProjectConfig(TARGET_A, { canBeReadBy: 'none' })],
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
      tokenBudget: 100,
      targetProjectIds: [TARGET_A],
    });

    expect(response.results).toHaveLength(0);
    expect(response.policyDenial).toBeDefined();
    expect(response.policyDenial!.reasonCode).toBe('POL-CANNOT-BE-READ-BY');
    expect(inner.retrieve).not.toHaveBeenCalled();
  });

  it('returns policyDenial when control-state is hard_stopped', async () => {
    const inner = createInner([createResult(TARGET_A)]);
    const store = createProjectStore(
      new Map([
        [FROM_ID, createProjectConfig(FROM_ID)],
        [TARGET_A, createProjectConfig(TARGET_A)],
      ])
    );
    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: store,
      getProjectControlState: vi.fn().mockResolvedValue('hard_stopped'),
    });

    const response = await engine.retrieve({
      situation: 'test',
      projectId: FROM_ID,
      tokenBudget: 100,
      targetProjectIds: [TARGET_A],
    });

    expect(response.results).toHaveLength(0);
    expect(response.policyDenial).toBeDefined();
    expect(response.policyDenial!.reasonCode).toBe('POL-CONTROL-STATE-BLOCKED');
    expect(inner.retrieve).not.toHaveBeenCalled();
  });

  it('applies selection policy resultCap and populates truncationReason', async () => {
    const manyResults = Array.from({ length: 30 }, (_, i) =>
      createResult(FROM_ID, `content-${i}`, 'project')
    );
    const inner = createInner(manyResults);
    const store = createProjectStore(
      new Map([
        [FROM_ID, createProjectConfig(FROM_ID)],
        [TARGET_A, createProjectConfig(TARGET_A)],
      ])
    );
    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: store,
      selectionPolicy: { ...DEFAULT_CROSS_PROJECT_SELECTION_POLICY, resultCap: 5 },
    });

    const response = await engine.retrieve({
      situation: 'test',
      projectId: FROM_ID,
      tokenBudget: 1000,
      targetProjectIds: [TARGET_A],
    });

    expect(response.results).toHaveLength(5);
    expect(response.selectionAudit).toBeDefined();
    expect(response.selectionAudit!.candidateCount).toBe(30);
    expect(response.selectionAudit!.resultCount).toBe(5);
    expect(response.selectionAudit!.truncationReason).toBe('result_cap');
  });

  it('does not add selectionAudit when targetProjectIds is absent', async () => {
    const inner = createInner([createResult(FROM_ID)]);
    const store = createProjectStore(new Map([[FROM_ID, createProjectConfig(FROM_ID)]]));
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
    expect(response.selectionAudit).toBeUndefined();
  });
});
