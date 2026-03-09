/**
 * Phase 6.2 — Meta-vector schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  ProjectMetaVectorSchema,
  MetaVectorSearchResultSchema,
} from '../../types/meta-vectors.js';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
} from '../../types/ids.js';

const PROJECT_ID = ProjectIdSchema.parse(
  '550e8400-e29b-41d4-a716-446655440000',
);
const ENTRY_ID = MemoryEntryIdSchema.parse(
  '660e8400-e29b-41d4-a716-446655440001',
);

describe('ProjectMetaVectorSchema', () => {
  it('accepts valid meta-vector with projectId, vector, basedOn, timestamps', () => {
    const valid = {
      projectId: PROJECT_ID,
      vector: [0.1, 0.2, 0.3],
      basedOn: [ENTRY_ID],
      evidenceRefs: [{ actionCategory: 'memory-write' as const }],
      inputDigest: 'a'.repeat(64),
      updatedAt: '2026-02-28T00:00:00.000Z',
      createdAt: '2026-02-27T00:00:00.000Z',
    };
    const parsed = ProjectMetaVectorSchema.parse(valid);
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.vector).toEqual([0.1, 0.2, 0.3]);
    expect(parsed.basedOn).toHaveLength(1);
    expect(parsed.evidenceRefs).toHaveLength(1);
    expect(parsed.inputDigest).toBe('a'.repeat(64));
    expect(parsed.updatedAt).toBe('2026-02-28T00:00:00.000Z');
  });

  it('defaults evidenceRefs when omitted', () => {
    const parsed = ProjectMetaVectorSchema.parse({
      projectId: PROJECT_ID,
      vector: [0.1],
      basedOn: [ENTRY_ID],
      updatedAt: '2026-02-28T00:00:00.000Z',
      createdAt: '2026-02-27T00:00:00.000Z',
    });
    expect(parsed.evidenceRefs).toEqual([]);
  });

  it('rejects empty vector', () => {
    expect(() =>
      ProjectMetaVectorSchema.parse({
        projectId: PROJECT_ID,
        vector: [],
        basedOn: [],
        updatedAt: '2026-02-28T00:00:00.000Z',
        createdAt: '2026-02-27T00:00:00.000Z',
      })
    ).toThrow();
  });

  it('rejects invalid datetime', () => {
    expect(() =>
      ProjectMetaVectorSchema.parse({
        projectId: PROJECT_ID,
        vector: [0.1],
        basedOn: [],
        updatedAt: 'not-a-datetime',
        createdAt: '2026-02-27T00:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('MetaVectorSearchResultSchema', () => {
  it('accepts valid result with projectId, similarity, rank', () => {
    const valid = {
      projectId: PROJECT_ID,
      similarity: 0.95,
      rank: 1,
    };
    const parsed = MetaVectorSearchResultSchema.parse(valid);
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.similarity).toBe(0.95);
    expect(parsed.rank).toBe(1);
  });

  it('rejects rank less than 1', () => {
    expect(() =>
      MetaVectorSearchResultSchema.parse({
        projectId: PROJECT_ID,
        similarity: 0.5,
        rank: 0,
      })
    ).toThrow();
  });
});
