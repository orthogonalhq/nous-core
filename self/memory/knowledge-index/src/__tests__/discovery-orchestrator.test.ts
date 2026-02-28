/**
 * Phase 6.3 — DiscoveryOrchestrator behavior tests.
 */
import { describe, it, expect } from 'vitest';
import { DiscoveryOrchestrator } from '../discovery/discovery-orchestrator.js';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { InMemoryProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import { InMemoryRelationshipGraphStore } from '../relationships/relationship-graph-store.js';
import {
  ProjectIdSchema,
  type ProjectMetaVector,
} from '@nous/shared';

const P1 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const P2 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440001');
const P3 = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440002');

function makeMetaVector(
  projectId: string,
  vector: number[],
): ProjectMetaVector {
  const now = new Date().toISOString();
  return {
    projectId: projectId as Parameters<typeof ProjectIdSchema.parse>[0],
    vector,
    basedOn: [],
    updatedAt: now,
    createdAt: now,
  };
}

describe('DiscoveryOrchestrator', () => {
  it('discoverRelevantProjects returns ranked project IDs with audit', async () => {
    const vectorStore = new InMemoryVectorStore();
    const metaStore = new MetaVectorStore({ vectorStore });
    const v1 = [1, 0, 0];
    const v2 = [0.9, 0.1, 0];
    const v3 = [0.5, 0.5, 0];
    await metaStore.upsert(makeMetaVector(P1, v1));
    await metaStore.upsert(makeMetaVector(P2, v2));
    await metaStore.upsert(makeMetaVector(P3, v3));

    const orchestrator = new DiscoveryOrchestrator({
      metaVectorStore: metaStore,
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
    });

    const output = await orchestrator.discoverRelevantProjects({
      queryVector: v1,
      topK: 2,
      requestingProjectId: P1,
    });

    expect(output.projectIds).toHaveLength(2);
    expect(output.projectIds[0]).toBe(P1);
    expect(output.results[0]!.rank).toBe(1);
    expect(output.audit.projectIdsDiscovered).toHaveLength(2);
    expect(output.audit.mergeStrategy).toBeDefined();
    expect(output.explainability).toBeDefined();
    expect(output.explainability).toHaveLength(2);
    expect(output.explainability![0]).toMatchObject({
      resultIndex: 0,
      projectId: P1,
      influencingSource: expect.any(String),
      evidenceRefs: expect.any(Array),
    });
    expect(output.explainability![0]!.evidenceRefs).toHaveLength(1);
  });

  it('discoverRelevantProjects tie-breaks by projectId', async () => {
    const vectorStore = new InMemoryVectorStore();
    const metaStore = new MetaVectorStore({ vectorStore });
    const sameVec = [0.5, 0.5, 0.5];
    await metaStore.upsert(makeMetaVector(P1, sameVec));
    await metaStore.upsert(makeMetaVector(P2, sameVec));

    const orchestrator = new DiscoveryOrchestrator({
      metaVectorStore: metaStore,
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
    });

    const output = await orchestrator.discoverRelevantProjects({
      queryVector: sameVec,
      topK: 2,
      requestingProjectId: P1,
    });

    expect(output.projectIds).toHaveLength(2);
    expect(output.projectIds).toEqual(
      [P1, P2].sort((a, b) => String(a).localeCompare(String(b))),
    );
  });

  it('discoverRelevantProjects with includeMetaVector false uses taxonomy/relationships', async () => {
    const taxonomy = new InMemoryProjectTaxonomyMapping();
    await taxonomy.setTagsForProject(P1, ['finance']);
    await taxonomy.setTagsForProject(P2, ['finance']);

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
    expect(output.audit.taxonomyCount).toBe(1);
  });
});
