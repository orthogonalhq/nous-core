import { describe, it, expect } from 'vitest';
import type { IEmbedder } from '@nous/shared';
import { InMemoryEmbedder } from '../in-memory-embedder.js';
import { DeterministicEmbeddingPipeline } from '../deterministic-embedding-pipeline.js';

const UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const NOW = '2026-03-06T17:30:00.000Z';
const HASH = 'a'.repeat(64);

function buildPipeline(embedder: IEmbedder): DeterministicEmbeddingPipeline {
  return new DeterministicEmbeddingPipeline({
    embedder,
    profile: {
      modelId: 'nous-test-embedder',
      modelVersion: '1.0.0',
      modelHash: HASH,
      provider: 'test',
      dimensions: embedder.getDimensions(),
    },
    idFactory: () => UUID_1,
    now: () => NOW,
  });
}

describe('DeterministicEmbeddingPipeline', () => {
  it('embedText() returns deterministic vector for equivalent normalized input', async () => {
    const embedder = new InMemoryEmbedder(16);
    const pipeline = buildPipeline(embedder);

    const first = await pipeline.embedText('  hello\r\nworld  ');
    const second = await pipeline.embedText('hello\nworld');

    expect(first.normalizedText).toBe('hello\nworld');
    expect(second.normalizedText).toBe('hello\nworld');
    expect(first.vector).toEqual(second.vector);
    expect(first.tokenEstimate).toBeGreaterThan(0);
    expect(first.generation.inputHash).toBe(second.generation.inputHash);
  });

  it('embedBatch() preserves input ordering', async () => {
    const embedder = new InMemoryEmbedder(16);
    const pipeline = buildPipeline(embedder);

    const result = await pipeline.embedBatch(['first', 'second', 'third']);

    expect(result.vectors).toHaveLength(3);
    expect(result.normalizedTexts).toEqual(['first', 'second', 'third']);
    expect(result.tokenEstimates).toHaveLength(3);
    expect(result.generations).toHaveLength(3);
  });

  it('throws ValidationError when profile dimensions mismatch embedder dimensions', () => {
    const embedder = new InMemoryEmbedder(8);

    expect(
      () =>
        new DeterministicEmbeddingPipeline({
          embedder,
          profile: {
            modelId: 'nous-test-embedder',
            modelVersion: '1.0.0',
            modelHash: HASH,
            provider: 'test',
            dimensions: 16,
          },
        }),
    ).toThrowError(/dimensions mismatch/i);
  });

  it('throws ValidationError when embedder returns non-finite values', async () => {
    const badEmbedder: IEmbedder = {
      async embed(): Promise<number[]> {
        return [NaN, 1];
      },
      async embedBatch(): Promise<number[][]> {
        return [[NaN, 1]];
      },
      getDimensions(): number {
        return 2;
      },
    };
    const pipeline = buildPipeline(badEmbedder);
    await expect(pipeline.embedText('bad')).rejects.toThrowError(
      /non-finite values/i,
    );
  });

  it('buildIndexMetadata() emits trace-linked metadata with evidence refs', async () => {
    const embedder = new InMemoryEmbedder(8);
    const pipeline = buildPipeline(embedder);
    const embedded = await pipeline.embedText('index me');

    const metadata = pipeline.buildIndexMetadata({
      memoryEntryId: UUID_1 as any,
      memoryType: 'fact',
      scope: 'project',
      projectId: UUID_2 as any,
      traceId: UUID_1 as any,
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      tokenEstimate: embedded.tokenEstimate,
      generation: embedded.generation,
    });

    expect(metadata.memoryEntryId).toBe(UUID_1);
    expect(metadata.traceId).toBe(UUID_1);
    expect(metadata.evidenceRefs).toHaveLength(1);
    expect(metadata.embedding.profile.modelId).toBe('nous-test-embedder');
  });
});

