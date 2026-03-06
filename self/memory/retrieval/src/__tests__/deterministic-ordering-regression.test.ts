import { describe, it, expect } from 'vitest';
import { SentimentWeightedRetrievalEngine } from '../sentiment-weighted-retrieval-engine.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryLtmStore } from '@nous/memory-stubs';

const NOW = new Date().toISOString();

function makeEntry(id: string, content: string) {
  return {
    id: id as any,
    content,
    type: 'fact' as const,
    scope: 'project' as const,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent' as const,
    provenance: { traceId: 't' as any, source: 'test', timestamp: NOW },
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('deterministic ordering regression', () => {
  it('returns stable result order for equivalent repeated queries', async () => {
    const ltm = new InMemoryLtmStore();
    const vectorStore = new InMemoryVectorStore();
    const embedder = new InMemoryEmbedder();

    const content = 'identical tie-break content';
    const entries = [
      makeEntry('c-id', content),
      makeEntry('a-id', content),
      makeEntry('b-id', content),
    ];
    for (const entry of entries) {
      await ltm.write(entry);
      const vector = await embedder.embed(entry.content);
      await vectorStore.upsert('memory', entry.id, vector, {});
    }

    const engine = new SentimentWeightedRetrievalEngine({
      ltmStore: ltm,
      vectorStore,
      embedder,
    });

    const run = async () =>
      (await engine.retrieve({
        situation: content,
        tokenBudget: 1000,
      })).results.map((item) => item.entry.id);

    const first = await run();
    const second = await run();
    const third = await run();

    expect(first).toEqual(['a-id', 'b-id', 'c-id']);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });
});

