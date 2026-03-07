/**
 * Phase 4.2 — Retrieval path verification.
 *
 * Verifies 100% retrieval path through PolicyEnforcedRetrievalEngine.
 * No direct IRetrievalEngine bypass; all retrieval flows through policy.
 */
import { describe, it, expect } from 'vitest';
import {
  PolicyEnforcedRetrievalEngine,
  MemoryAccessPolicyEngine,
} from '../index.js';
import { SentimentWeightedRetrievalEngine } from '@nous/memory-retrieval';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { IProjectStore, ProjectConfig } from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY, ProjectIdSchema } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJECT_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

function makeEntry(
  id: string,
  content: string,
  confidence: number,
  updatedAt: string,
): Parameters<InMemoryLtmStore['write']>[0] {
  return {
    id: id as any,
    content,
    type: 'fact',
    scope: 'project',
    projectId: PROJECT_ID,
    confidence,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: 't' as any, source: 'test', timestamp: NOW },
    tags: [],
    createdAt: NOW,
    updatedAt,
  };
}

function createProjectStore(config: ProjectConfig): IProjectStore {
  return {
    create: async () => config.id,
    get: async () => config,
    list: async () => [],
    update: async () => {},
    archive: async () => {},
  };
}

describe('Phase 4.2 — Retrieval path verification', () => {
  it('full path: PolicyEnforcedRetrievalEngine → SentimentWeightedRetrievalEngine → InMemory stores', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const entry = makeEntry('e1', 'hello world', 0.9, NOW);
    await ltm.write(entry);
    const vec = await embedder.embed(entry.content);
    await vectorStore.upsert('memory', entry.id, vec, {});

    const inner = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const projectConfig: ProjectConfig = {
      id: PROJECT_ID,
      name: 'Test',
      type: 'protocol',
      pfcTier: 0,
      memoryAccessPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      escalationChannels: [],
      retrievalBudgetTokens: 500,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: createProjectStore(projectConfig),
    });

    const response = await engine.retrieve({
      situation: 'hello world',
      projectId: PROJECT_ID,
      tokenBudget: 100,
    });

    expect(response).toHaveProperty('results');
    expect(Array.isArray(response.results)).toBe(true);
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]).toHaveProperty('entry');
    expect(response.results[0]).toHaveProperty('score');
    expect(response.results[0]).toHaveProperty('components');
    expect(response.policyDenial).toBeUndefined();
    expect(response.budgetTelemetry).toBeDefined();
    expect(response.decision?.returnedCount).toBe(response.results.length);
  });

  it('policy denial returns policyDenial when policy denies', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const inner = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const projectConfig: ProjectConfig = {
      id: PROJECT_ID,
      name: 'Test',
      type: 'protocol',
      pfcTier: 0,
      memoryAccessPolicy: { ...DEFAULT_MEMORY_ACCESS_POLICY, inheritsGlobal: false },
      escalationChannels: [],
      retrievalBudgetTokens: 500,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const engine = new PolicyEnforcedRetrievalEngine({
      policyEngine: new MemoryAccessPolicyEngine(),
      inner,
      projectStore: createProjectStore(projectConfig),
    });

    const response = await engine.retrieve({
      situation: 'test',
      projectId: PROJECT_ID,
      scope: 'global',
      tokenBudget: 100,
    });

    expect(response.results).toEqual([]);
    expect(response.policyDenial).toBeDefined();
    expect(response.decision?.truncationReason).toBe('policy_denied');
  });
});
