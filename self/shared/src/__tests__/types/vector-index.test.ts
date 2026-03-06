import { describe, it, expect } from 'vitest';
import {
  EmbeddingModelProvenanceSchema,
  EmbeddingGenerationRecordSchema,
  VectorIndexMetadataSchema,
  VectorIndexRequestSchema,
  VectorIndexResultSchema,
} from '../../types/vector-index.js';

const UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const HASH = 'a'.repeat(64);
const NOW = new Date().toISOString();

describe('EmbeddingModelProvenanceSchema', () => {
  it('accepts valid profile metadata', () => {
    const result = EmbeddingModelProvenanceSchema.safeParse({
      modelId: 'nous-test-embedder',
      modelVersion: '1.0.0',
      modelHash: HASH,
      provider: 'test',
      dimensions: 128,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid model hash', () => {
    const result = EmbeddingModelProvenanceSchema.safeParse({
      modelId: 'nous-test-embedder',
      modelVersion: '1.0.0',
      modelHash: 'invalid',
      provider: 'test',
      dimensions: 128,
    });
    expect(result.success).toBe(false);
  });
});

describe('EmbeddingGenerationRecordSchema', () => {
  it('accepts valid generation record', () => {
    const result = EmbeddingGenerationRecordSchema.safeParse({
      requestId: UUID_1,
      generatedAt: NOW,
      inputHash: HASH,
      profile: {
        modelId: 'nous-test-embedder',
        modelVersion: '1.0.0',
        modelHash: HASH,
        provider: 'test',
        dimensions: 128,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('VectorIndexMetadataSchema', () => {
  const valid = {
    memoryEntryId: UUID_1,
    memoryType: 'fact',
    scope: 'project',
    projectId: UUID_2,
    traceId: UUID_1,
    evidenceRefs: [{ actionCategory: 'memory-write' as const }],
    tokenEstimate: 42,
    embedding: {
      requestId: UUID_1,
      generatedAt: NOW,
      inputHash: HASH,
      profile: {
        modelId: 'nous-test-embedder',
        modelVersion: '1.0.0',
        modelHash: HASH,
        provider: 'test',
        dimensions: 128,
      },
    },
  };

  it('accepts valid metadata payload', () => {
    const result = VectorIndexMetadataSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty evidence refs', () => {
    const result = VectorIndexMetadataSchema.safeParse({
      ...valid,
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('VectorIndexRequestSchema', () => {
  it('accepts request payload with trace-linked metadata', () => {
    const result = VectorIndexRequestSchema.safeParse({
      collection: 'memory',
      content: 'user prefers concise responses',
      metadata: {
        memoryEntryId: UUID_1,
        memoryType: 'preference',
        scope: 'project',
        projectId: UUID_2,
        traceId: UUID_1,
        evidenceRefs: [{ actionCategory: 'memory-write' as const }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('VectorIndexResultSchema', () => {
  it('accepts successful indexing result', () => {
    const result = VectorIndexResultSchema.safeParse({
      indexed: true,
      vectorId: UUID_1,
      tokenEstimate: 9,
      generatedAt: NOW,
    });
    expect(result.success).toBe(true);
  });
});

