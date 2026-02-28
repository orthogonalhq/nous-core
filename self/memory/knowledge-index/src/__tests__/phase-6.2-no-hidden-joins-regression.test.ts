/**
 * Phase 6.2 — Regression: no hidden cross-project joins.
 *
 * Meta-vector and taxonomy layers produce candidate project IDs only.
 * All cross-project retrieval requires explicit targetProjectIds.
 */
import { describe, it, expect } from 'vitest';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import { MetaVectorService } from '../meta-vectors/meta-vector-service.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import { ProjectIdSchema } from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('phase-6.2 no hidden joins regression', () => {
  it('meta-vector search returns project IDs only, no retrieval', async () => {
    const vectorStore = new InMemoryVectorStore();
    const store = new MetaVectorStore({ vectorStore });
    const embedder = new InMemoryEmbedder(128);
    const service = new MetaVectorService({ store, embedder });
    const now = new Date().toISOString();
    await store.upsert({
      projectId: P1,
      vector: await embedder.embed('project one'),
      basedOn: [],
      updatedAt: now,
      createdAt: now,
    });
    const projectIds = await service.searchSimilarProjects(
      await embedder.embed('query'),
      5,
    );
    expect(projectIds).toEqual([P1]);
    expect(Array.isArray(projectIds)).toBe(true);
    expect(projectIds.every((id) => typeof id === 'string')).toBe(true);
  });

  it('taxonomy getProjectsForTag returns project IDs only', async () => {
    const mapping = new InMemoryProjectTaxonomyMapping();
    await mapping.setTagsForProject(P1, ['real-estate']);
    await mapping.setTagsForProject(P2, ['real-estate']);
    const projectIds = await mapping.getProjectsForTag('real-estate');
    expect(projectIds).toHaveLength(2);
    expect(projectIds).toContain(P1);
    expect(projectIds).toContain(P2);
  });
});
