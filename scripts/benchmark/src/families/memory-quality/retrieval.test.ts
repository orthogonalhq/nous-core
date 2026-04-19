/**
 * MemoryQualityBench retrieval subset — relevance and policy-conformance.
 *
 * Phase 4.2: Semantically similar results rank higher than distant high-sentiment;
 * policy-conformance acceptance criteria.
 */
import { describe, it, expect } from 'vitest';
import { SentimentWeightedRetrievalEngine } from '@nous/memory-retrieval';
import {
  PolicyEnforcedRetrievalEngine,
  MemoryAccessPolicyEngine,
} from '@nous/memory-access';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { IProjectStore, ProjectConfig, ProjectId } from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY, ProjectIdSchema } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJECT_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

function makeEntry(
  id: string,
  content: string,
  confidence: number,
  updatedAt: string,
  type: 'fact' | 'experience-record' = 'fact',
): Parameters<InMemoryLtmStore['write']>[0] {
  const base = {
    id: id as any,
    content,
    type,
    scope: 'project' as const,
    projectId: PROJECT_ID,
    confidence,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: { traceId: 't' as any, source: 'test', timestamp: NOW },
    tags: [],
    createdAt: NOW,
    updatedAt,
  };
  if (type === 'experience-record') {
    return {
      ...base,
      sentiment: 'positive' as const,
      context: 'ctx',
      action: 'act',
      outcome: 'out',
      reason: 'reason',
    };
  }
  return base;
}

function createProjectStore(config: ProjectConfig): IProjectStore {
  return {
    create: async () => config.id,
    get: async () => config,
    list: async () => [],
    update: async () => {},
    archive: async () => {},
    unarchive: async () => {},
  };
}

describe('MemoryQualityBench — retrieval', () => {
  describe('relevance', () => {
    it('semantically similar results rank higher than distant high-sentiment', async () => {
      const ltm = new InMemoryLtmStore();
      const vectorStore = new InMemoryVectorStore();
      const embedder = new InMemoryEmbedder();

      const similar = makeEntry('sim', 'user asked about deployment', 0.8, NOW);
      const distant = makeEntry(
        'dist',
        'completely unrelated topic xyz',
        0.9,
        NOW,
        'experience-record',
      );
      await ltm.write(similar);
      await ltm.write(distant);

      for (const e of [similar, distant]) {
        const vec = await embedder.embed(e.content);
        await vectorStore.upsert('memory', e.id, vec, {});
      }

      const engine = new SentimentWeightedRetrievalEngine({
        ltmStore: ltm,
        vectorStore,
        embedder,
      });

      const response = await engine.retrieve({
        situation: 'user asked about deployment',
        tokenBudget: 500,
      });

      expect(response.results.length).toBe(2);
      expect(response.results[0]!.entry.id).toBe('sim');
    });
  });

  describe('policy-conformance', () => {
    it('policy denial returns policyDenial in RetrievalResponse', async () => {
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
        memoryAccessPolicy: {
          ...DEFAULT_MEMORY_ACCESS_POLICY,
          inheritsGlobal: false,
        },
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
    });
  });
});
