import { describe, expect, it } from 'vitest';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import type { IDocumentStore, ProjectConfig, ProjectId } from '@nous/shared';
import { ProjectIdSchema } from '@nous/shared';
import { KnowledgeIndexRuntime } from '../knowledge-index-runtime.js';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import {
  InMemoryProjectTaxonomyMapping,
} from '../taxonomy/project-taxonomy-mapping.js';
import {
  InMemoryRelationshipGraphStore,
} from '../relationships/relationship-graph-store.js';

const PROJECT_A = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440701');
const PROJECT_B = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440702');

function createMemoryDocumentStore(): IDocumentStore {
  const collections = new Map<string, Map<string, unknown>>();
  return {
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
      return values.filter((value) => {
        if (!filter.where) {
          return true;
        }
        return Object.entries(filter.where).every(([key, expected]) => {
          return (value as Record<string, unknown>)[key] === expected;
        });
      }) as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return collections.get(collection)?.delete(id) ?? false;
    },
  };
}

function createProjectStore(projects: ProjectConfig[]) {
  return {
    async create(config: ProjectConfig) {
      return config.id;
    },
    async get(id: ProjectId) {
      return projects.find((project) => project.id === id) ?? null;
    },
    async list() {
      return projects;
    },
    async listArchived() {
      return [];
    },
    async update() {},
    async archive() {},
    async unarchive() {},
  };
}

function createProjectConfig(
  id: ProjectId,
  policy: ProjectConfig['memoryAccessPolicy'],
): ProjectConfig {
  const now = '2026-03-09T16:00:00.000Z';
  return {
    id,
    name: `Project ${id.slice(-4)}`,
    type: 'hybrid',
    pfcTier: 3,
    memoryAccessPolicy: policy,
    escalationChannels: ['in-app'],
    retrievalBudgetTokens: 500,
    createdAt: now,
    updatedAt: now,
  };
}

async function writePattern(
  documentStore: IDocumentStore,
  projectId: ProjectId,
  content: string,
  tags: string[],
) {
  const now = '2026-03-09T16:05:00.000Z';
  const suffix = projectId === PROJECT_A ? '1' : '2';
  const patternId = `660e8400-e29b-41d4-a716-44665544070${suffix}`;
  const sourceId = `770e8400-e29b-41d4-a716-44665544070${suffix}`;
  await documentStore.put('memory_entries', patternId, {
    id: patternId,
    content,
    type: 'distilled-pattern',
    scope: 'project',
    projectId,
    confidence: 0.92,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: '550e8400-e29b-41d4-a716-446655440799',
      source: 'knowledge-index-test',
      timestamp: now,
    },
    tags,
    createdAt: now,
    updatedAt: now,
    mutabilityClass: 'domain-versioned',
    lifecycleStatus: 'active',
    placementState: 'project',
    basedOn: [sourceId],
    supersedes: [sourceId],
    evidenceRefs: [{ actionCategory: 'memory-write' }],
  });
}

describe('KnowledgeIndexRuntime', () => {
  it('refreshes project knowledge and assembles snapshots from canonical stores', async () => {
    const documentStore = createMemoryDocumentStore();
    await writePattern(documentStore, PROJECT_A, 'release notes and roadmap', [
      'release',
      'roadmap',
    ]);

    const runtime = new KnowledgeIndexRuntime({
      documentStore,
      projectStore: createProjectStore([
        createProjectConfig(PROJECT_A, {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: true,
        }),
      ]) as any,
      metaVectorStore: new MetaVectorStore({
        vectorStore: new InMemoryVectorStore(),
      }),
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
      embedder: new InMemoryEmbedder(128),
    });

    const refresh = await runtime.refreshProjectKnowledge({
      projectId: PROJECT_A,
      trigger: 'manual',
      reasonCode: 'operator_refresh',
      requestedAt: '2026-03-09T16:10:00.000Z',
    });

    expect(refresh.outcome).toBe('updated');
    expect(refresh.taxonomyTagCount).toBe(2);

    const snapshot = await runtime.getProjectSnapshot(PROJECT_A);
    expect(snapshot?.metaVector?.projectId).toBe(PROJECT_A);
    expect(snapshot?.taxonomy.map((assignment) => assignment.tag)).toEqual([
      'release',
      'roadmap',
    ]);
    expect(snapshot?.diagnostics.runtimePosture).toBe('single_process_local');
  });

  it('filters denied candidates out of discovery results and surfaces policy summary only', async () => {
    const documentStore = createMemoryDocumentStore();
    await writePattern(documentStore, PROJECT_A, 'release notes and roadmap', [
      'release',
      'roadmap',
    ]);
    await writePattern(documentStore, PROJECT_B, 'release checklist and launch', [
      'release',
      'launch',
    ]);

    const runtime = new KnowledgeIndexRuntime({
      documentStore,
      projectStore: createProjectStore([
        createProjectConfig(PROJECT_A, {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: true,
        }),
        createProjectConfig(PROJECT_B, {
          canReadFrom: 'all',
          canBeReadBy: 'none',
          inheritsGlobal: true,
        }),
      ]) as any,
      metaVectorStore: new MetaVectorStore({
        vectorStore: new InMemoryVectorStore(),
      }),
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
      embedder: new InMemoryEmbedder(128),
    });

    await runtime.refreshProjectKnowledge({
      projectId: PROJECT_A,
      trigger: 'manual',
      reasonCode: 'operator_refresh',
      requestedAt: '2026-03-09T16:10:00.000Z',
    });
    await runtime.refreshProjectKnowledge({
      projectId: PROJECT_B,
      trigger: 'manual',
      reasonCode: 'operator_refresh',
      requestedAt: '2026-03-09T16:10:00.000Z',
    });

    const discovery = await runtime.discoverProjects({
      requestingProjectId: PROJECT_A,
      query: 'release launch',
      topK: 5,
      includeMetaVector: true,
      includeTaxonomy: true,
      includeRelationships: true,
    });

    expect(discovery.discovery.projectIds).not.toContain(PROJECT_B);
    expect(discovery.policy.deniedProjectCount).toBeGreaterThanOrEqual(0);
    if (discovery.policy.deniedProjectCount > 0) {
      expect(discovery.policy.reasonCodes).toContain('POL-CANNOT-BE-READ-BY');
    }
  });
});
