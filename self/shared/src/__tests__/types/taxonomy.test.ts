/**
 * Phase 6.2 — Taxonomy schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  TaxonomyTagSchema,
  ProjectTaxonomyMappingSchema,
} from '../../types/taxonomy.js';
import { ProjectIdSchema } from '../../types/ids.js';

const PROJECT_ID = ProjectIdSchema.parse(
  '550e8400-e29b-41d4-a716-446655440000',
);

describe('TaxonomyTagSchema', () => {
  it('accepts valid tag string', () => {
    const parsed = TaxonomyTagSchema.parse('real-estate');
    expect(parsed).toBe('real-estate');
  });

  it('rejects empty string', () => {
    expect(() => TaxonomyTagSchema.parse('')).toThrow();
  });

  it('rejects string longer than 128', () => {
    expect(() => TaxonomyTagSchema.parse('a'.repeat(129))).toThrow();
  });

  it('accepts 128 chars', () => {
    const parsed = TaxonomyTagSchema.parse('a'.repeat(128));
    expect(parsed).toHaveLength(128);
  });
});

describe('ProjectTaxonomyMappingSchema', () => {
  it('accepts valid mapping with projectId, tags, updatedAt', () => {
    const valid = {
      projectId: PROJECT_ID,
      tags: ['real-estate', 'budgeting'],
      updatedAt: '2026-02-28T00:00:00.000Z',
    };
    const parsed = ProjectTaxonomyMappingSchema.parse(valid);
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.tags).toEqual(['real-estate', 'budgeting']);
    expect(parsed.updatedAt).toBe('2026-02-28T00:00:00.000Z');
  });

  it('accepts empty tags', () => {
    const valid = {
      projectId: PROJECT_ID,
      tags: [],
      updatedAt: '2026-02-28T00:00:00.000Z',
    };
    const parsed = ProjectTaxonomyMappingSchema.parse(valid);
    expect(parsed.tags).toEqual([]);
  });
});
