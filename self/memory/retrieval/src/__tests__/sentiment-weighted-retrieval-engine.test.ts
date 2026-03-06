/**
 * SentimentWeightedRetrievalEngine behavior tests.
 *
 * Phase 4.2: Uses InMemoryVectorStore, InMemoryEmbedder, InMemoryLtmStore.
 */
import { describe, it, expect } from 'vitest';
import { SentimentWeightedRetrievalEngine } from '../sentiment-weighted-retrieval-engine.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryLtmStore } from '@nous/memory-stubs';

const NOW = new Date().toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

function makeEntry(
  id: string,
  content: string,
  confidence: number,
  updatedAt: string,
  type: 'fact' | 'experience-record' | 'preference' = 'fact',
  projectId?: string,
): Parameters<InMemoryLtmStore['write']>[0] {
  const base = {
    id: id as any,
    content,
    type,
    scope: 'project' as const,
    projectId: projectId as any,
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

describe('SentimentWeightedRetrievalEngine', () => {
  it('returns RetrievalResponse shape', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const entry = makeEntry('e1', 'hello world', 0.9, NOW);
    await ltm.write(entry);
    const vec = await embedder.embed(entry.content);
    await vectorStore.upsert('memory', entry.id, vec, {});

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: 'hello world',
      tokenBudget: 100,
    });

    expect(response).toHaveProperty('results');
    expect(Array.isArray(response.results)).toBe(true);
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]).toHaveProperty('entry');
    expect(response.results[0]).toHaveProperty('score');
    expect(response.results[0]).toHaveProperty('components');
  });

  it('combines similarity, sentiment, recency, confidence in scoring', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const e1 = makeEntry('a', 'similar query', 0.9, NOW);
    const e2 = makeEntry('b', 'different topic', 0.9, NOW);
    await ltm.write(e1);
    await ltm.write(e2);

    for (const e of [e1, e2]) {
      const vec = await embedder.embed(e.content);
      await vectorStore.upsert('memory', e.id, vec, {});
    }

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: 'similar query',
      tokenBudget: 100,
    });

    expect(response.results.length).toBe(2);
    const top = response.results[0];
    expect(top!.entry.id).toBe('a');
    expect(top!.components).toMatchObject({
      similarity: expect.any(Number),
      sentimentWeight: expect.any(Number),
      recency: expect.any(Number),
      confidence: expect.any(Number),
    });
  });

  it('applies budget truncation when tokenBudget is small', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const long = 'x'.repeat(100);
    const e1 = makeEntry('a', long, 0.9, NOW);
    const e2 = makeEntry('b', long, 0.8, NOW);
    await ltm.write(e1);
    await ltm.write(e2);

    for (const e of [e1, e2]) {
      const vec = await embedder.embed(e.content);
      await vectorStore.upsert('memory', e.id, vec, {});
    }

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: long,
      tokenBudget: 5,
    });

    expect(response.results.length).toBeLessThan(2);
  });

  it('returns empty results when no vector matches', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: 'orphan query',
      tokenBudget: 100,
    });

    expect(response.results).toEqual([]);
  });

  it('sorts by score desc, tie-break by id asc', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const same = 'identical content';
    const e1 = makeEntry('z', same, 0.8, NOW);
    const e2 = makeEntry('a', same, 0.9, NOW);
    const e3 = makeEntry('m', same, 0.8, NOW);
    await ltm.write(e1);
    await ltm.write(e2);
    await ltm.write(e3);

    for (const e of [e1, e2, e3]) {
      const vec = await embedder.embed(e.content);
      await vectorStore.upsert('memory', e.id, vec, {});
    }

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: same,
      tokenBudget: 1000,
    });

    expect(response.results.length).toBe(3);
    const ids = response.results.map((r) => r.entry.id);
    const scores = response.results.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
      if (scores[i] === scores[i - 1]) {
        expect(ids[i]! >= ids[i - 1]!).toBe(true);
      }
    }
  });

  it('applies vector metadata filters for project/type/scope', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();
    const projectId = '550e8400-e29b-41d4-a716-446655440000';

    const fact = makeEntry('fact-1', 'shared content', 0.9, NOW, 'fact', projectId);
    const pref = makeEntry(
      'pref-1',
      'shared content',
      0.9,
      NOW,
      'preference',
      projectId,
    );
    await ltm.write(fact);
    await ltm.write(pref);

    for (const entry of [fact, pref]) {
      const vector = await embedder.embed(entry.content);
      await vectorStore.upsert('memory', entry.id, vector, {
        projectId,
        scope: entry.scope,
        memoryType: entry.type,
      });
    }

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const response = await engine.retrieve({
      situation: 'shared content',
      projectId: projectId as any,
      tokenBudget: 100,
      filters: {
        projectId: projectId as any,
        scope: 'project',
        type: 'fact',
      },
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0]!.entry.id).toBe('fact-1');
  });
});
