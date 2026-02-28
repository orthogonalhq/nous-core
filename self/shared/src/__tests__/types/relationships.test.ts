/**
 * Phase 6.3 — Relationship schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  RelationshipEdgeSchema,
  RelationshipEdgeTypeSchema,
  RelationshipMappingOutputSchema,
} from '../../types/relationships.js';
import { ProjectIdSchema, MemoryEntryIdSchema } from '../../types/ids.js';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');
const MID = MemoryEntryIdSchema.parse('660e8400-e29b-41d4-a716-446655440000');

describe('RelationshipEdgeTypeSchema', () => {
  it('accepts thematic, causal, structural', () => {
    expect(RelationshipEdgeTypeSchema.safeParse('thematic').success).toBe(true);
    expect(RelationshipEdgeTypeSchema.safeParse('causal').success).toBe(true);
    expect(RelationshipEdgeTypeSchema.safeParse('structural').success).toBe(true);
  });
  it('rejects invalid types', () => {
    expect(RelationshipEdgeTypeSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('RelationshipEdgeSchema', () => {
  it('accepts valid edge', () => {
    const valid = {
      id: crypto.randomUUID(),
      sourceProjectId: P1,
      targetProjectId: P2,
      strength: 0.8,
      type: 'thematic' as const,
      evidenceRefs: [{ actionCategory: 'memory-write' as const }],
      sourcePatternIds: [MID],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(RelationshipEdgeSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects strength out of range', () => {
    const invalid = {
      id: crypto.randomUUID(),
      sourceProjectId: P1,
      targetProjectId: P2,
      strength: 1.5,
      type: 'thematic',
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      sourcePatternIds: [MID],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(RelationshipEdgeSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('RelationshipMappingOutputSchema', () => {
  it('accepts valid output', () => {
    const valid = {
      projectId: P1,
      edgesCreated: 2,
      edgesUpdated: 0,
      edgesInvalidated: 1,
      evidenceRefs: [],
    };
    expect(RelationshipMappingOutputSchema.safeParse(valid).success).toBe(true);
  });
});
