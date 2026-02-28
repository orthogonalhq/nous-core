/**
 * Phase 6.3 — Regression: no hidden cross-project joins.
 *
 * Discovery produces candidate project IDs only.
 * All cross-project retrieval requires explicit targetProjectIds.
 */
import { describe, it, expect } from 'vitest';
import { DiscoveryOrchestrator } from '../discovery/discovery-orchestrator.js';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import { InMemoryRelationshipGraphStore } from '../relationships/relationship-graph-store.js';
import { ProjectIdSchema } from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');

describe('phase-6.3 no hidden joins regression', () => {
  it('discovery returns project IDs only, no retrieval', async () => {
    const vectorStore = new InMemoryVectorStore();
    const metaStore = new MetaVectorStore({ vectorStore });
    await metaStore.upsert({
      projectId: P1,
      vector: [1, 0, 0],
      basedOn: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const orchestrator = new DiscoveryOrchestrator({
      metaVectorStore: metaStore,
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
    });

    const output = await orchestrator.discoverRelevantProjects({
      queryVector: [1, 0, 0],
      topK: 5,
      requestingProjectId: P1,
    });

    expect(output.projectIds).toEqual([P1]);
    expect(Array.isArray(output.projectIds)).toBe(true);
    expect(output.projectIds.every((id) => typeof id === 'string')).toBe(true);
    expect(output.audit.projectIdsDiscovered).toEqual([P1]);
  });

  it('discovery returns project IDs only when using taxonomy, no retrieval', async () => {
    const taxonomy = new InMemoryProjectTaxonomyMapping();
    await taxonomy.setTagsForProject(P1, ['tag-a']);
    await taxonomy.setTagsForProject(P2, ['tag-a']);

    const orchestrator = new DiscoveryOrchestrator({
      metaVectorStore: new MetaVectorStore({
        vectorStore: new InMemoryVectorStore(),
      }),
      taxonomyMapping: taxonomy,
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
    });

    const output = await orchestrator.discoverRelevantProjects({
      queryVector: [],
      topK: 5,
      requestingProjectId: P1,
      includeMetaVector: false,
      includeTaxonomy: true,
      includeRelationships: false,
    });

    expect(output.projectIds).toContain(P2);
    expect(Array.isArray(output.projectIds)).toBe(true);
    expect(output.projectIds.every((id) => typeof id === 'string')).toBe(true);
  });
});
