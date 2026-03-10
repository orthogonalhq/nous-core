import { describe, expect, it } from 'vitest';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { InMemoryVectorStore } from '@nous/autonomic-storage';
import { ProjectIdSchema } from '@nous/shared';
import { KnowledgeIndexRuntime } from '../knowledge-index-runtime.js';
import { MetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import { InMemoryProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import { InMemoryRelationshipGraphStore } from '../relationships/relationship-graph-store.js';

const PROJECT_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440703');

function createMemoryDocumentStore() {
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
}

describe('knowledge-index refresh concurrency', () => {
  it('serializes same-project refreshes and skips duplicate digests', async () => {
    const documentStore = createMemoryDocumentStore();
    const now = '2026-03-09T16:05:00.000Z';
    await documentStore.put('memory_entries', '660e8400-e29b-41d4-a716-446655440703', {
      id: '660e8400-e29b-41d4-a716-446655440703',
      content: 'release notes and roadmap',
      type: 'distilled-pattern',
      scope: 'project',
      projectId: PROJECT_ID,
      confidence: 0.92,
      sensitivity: [],
      retention: 'permanent',
      provenance: {
        traceId: '550e8400-e29b-41d4-a716-446655440710',
        source: 'knowledge-index-test',
        timestamp: now,
      },
      tags: ['release'],
      createdAt: now,
      updatedAt: now,
      mutabilityClass: 'domain-versioned',
      lifecycleStatus: 'active',
      placementState: 'project',
      basedOn: ['770e8400-e29b-41d4-a716-446655440703'],
      supersedes: ['770e8400-e29b-41d4-a716-446655440703'],
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    });

    const runtime = new KnowledgeIndexRuntime({
      documentStore: documentStore as any,
      projectStore: {
        async create(config: any) {
          return config.id;
        },
        async get(id: any) {
          return {
            id,
            name: 'Concurrency Project',
            type: 'hybrid',
            pfcTier: 3,
            memoryAccessPolicy: {
              canReadFrom: 'all',
              canBeReadBy: 'all',
              inheritsGlobal: true,
            },
            escalationChannels: ['in-app'],
            retrievalBudgetTokens: 500,
            createdAt: now,
            updatedAt: now,
          };
        },
        async list() {
          return [];
        },
        async update() {},
        async archive() {},
      } as any,
      metaVectorStore: new MetaVectorStore({
        vectorStore: new InMemoryVectorStore(),
      }),
      taxonomyMapping: new InMemoryProjectTaxonomyMapping(),
      relationshipGraphStore: new InMemoryRelationshipGraphStore(),
      embedder: new InMemoryEmbedder(128),
    });

    const [first, second] = await Promise.all([
      runtime.refreshProjectKnowledge({
        projectId: PROJECT_ID,
        trigger: 'manual',
        reasonCode: 'operator_refresh',
        requestedAt: now,
      }),
      runtime.refreshProjectKnowledge({
        projectId: PROJECT_ID,
        trigger: 'manual',
        reasonCode: 'operator_refresh',
        requestedAt: now,
      }),
    ]);

    expect([first.outcome, second.outcome].sort()).toEqual([
      'skipped_no_change',
      'updated',
    ]);
    expect(second.inputDigest).toBe(first.inputDigest);
  });
});
