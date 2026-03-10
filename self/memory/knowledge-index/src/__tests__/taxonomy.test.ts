/**
 * Phase 6.2 — Taxonomy store behavior tests.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryTaxonomyStore } from '../taxonomy/taxonomy-store.js';
import {
  DocumentProjectTaxonomyMapping,
  InMemoryProjectTaxonomyMapping,
} from '../taxonomy/project-taxonomy-mapping.js';
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

  it('preserves assignment metadata for snapshots', async () => {
    const mapping = new InMemoryProjectTaxonomyMapping();
    await mapping.setTagsForProject(P1, ['real-estate'], {
      refreshRecordId: '550e8400-e29b-41d4-a716-446655440099',
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      timestamp: '2026-03-09T16:00:00.000Z',
    });

    const assignments = await mapping.getAssignmentsForProject(P1);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.refreshRecordId).toBe(
      '550e8400-e29b-41d4-a716-446655440099',
    );
  });
});

describe('DocumentProjectTaxonomyMapping', () => {
  it('round-trips assignments through the document store', async () => {
    const collections = new Map<string, Map<string, unknown>>();
    const documentStore = {
      async put<T>(collection: string, id: string, document: T): Promise<void> {
        if (!collections.has(collection)) {
          collections.set(collection, new Map());
        }
        collections.get(collection)?.set(id, document);
      },
      async get<T>(collection: string, id: string): Promise<T | null> {
        return (collections.get(collection)?.get(id) as T | undefined) ?? null;
      },
      async query<T>(collection: string, filter: { where?: Record<string, unknown> }): Promise<T[]> {
        const values = Array.from(collections.get(collection)?.values() ?? []);
        return values.filter((value) =>
          Object.entries(filter.where ?? {}).every(
            ([key, expected]) => (value as Record<string, unknown>)[key] === expected,
          ),
        ) as T[];
      },
      async delete(collection: string, id: string): Promise<boolean> {
        return collections.get(collection)?.delete(id) ?? false;
      },
    };

    const mapping = new DocumentProjectTaxonomyMapping(documentStore as any);
    await mapping.setTagsForProject(P1, ['real-estate', 'budgeting'], {
      refreshRecordId: '550e8400-e29b-41d4-a716-446655440100',
      evidenceRefs: [{ actionCategory: 'memory-write' }],
      timestamp: '2026-03-09T16:00:00.000Z',
    });

    expect(await mapping.getTagsForProject(P1)).toEqual([
      'budgeting',
      'real-estate',
    ]);
    expect(await mapping.getProjectsForTag('real-estate')).toContain(P1);
    expect((await mapping.getAssignmentsForProject(P1))[0]?.evidenceRefs).toEqual([
      { actionCategory: 'memory-write' },
    ]);
  });
});
