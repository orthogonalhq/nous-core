/**
 * Phase 6.2 — Taxonomy store behavior tests.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryTaxonomyStore } from '../taxonomy/taxonomy-store.js';
import { InMemoryProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import { ProjectIdSchema } from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('InMemoryTaxonomyStore', () => {
  it('addTag is additive and listTags returns sorted tags', async () => {
    const store = new InMemoryTaxonomyStore();
    await store.addTag('real-estate');
    await store.addTag('budgeting');
    const tags = await store.listTags();
    expect(tags).toEqual(['budgeting', 'real-estate']);
  });

  it('getTagMetadata returns metadata when set', async () => {
    const store = new InMemoryTaxonomyStore();
    await store.addTag('finance', {
      description: 'Financial planning',
      addedAt: '2026-02-28T00:00:00.000Z',
    });
    const meta = await store.getTagMetadata('finance');
    expect(meta).not.toBeNull();
    expect(meta!.description).toBe('Financial planning');
  });

  it('rejects invalid tag', async () => {
    const store = new InMemoryTaxonomyStore();
    await expect(store.addTag('')).rejects.toThrow();
  });
});

describe('InMemoryProjectTaxonomyMapping', () => {
  it('setTagsForProject and getTagsForProject work correctly', async () => {
    const mapping = new InMemoryProjectTaxonomyMapping();
    await mapping.setTagsForProject(P1, ['real-estate', 'budgeting']);
    const tags = await mapping.getTagsForProject(P1);
    expect(tags).toEqual(['budgeting', 'real-estate']);
  });

  it('getProjectsForTag returns projects with that tag', async () => {
    const mapping = new InMemoryProjectTaxonomyMapping();
    await mapping.setTagsForProject(P1, ['real-estate']);
    await mapping.setTagsForProject(P2, ['real-estate', 'budgeting']);
    const projects = await mapping.getProjectsForTag('real-estate');
    expect(projects).toHaveLength(2);
    expect(projects).toContain(P1);
    expect(projects).toContain(P2);
  });

  it('setTagsForProject replaces previous tags', async () => {
    const mapping = new InMemoryProjectTaxonomyMapping();
    await mapping.setTagsForProject(P1, ['real-estate']);
    await mapping.setTagsForProject(P1, ['budgeting']);
    const tags = await mapping.getTagsForProject(P1);
    expect(tags).toEqual(['budgeting']);
  });
});
