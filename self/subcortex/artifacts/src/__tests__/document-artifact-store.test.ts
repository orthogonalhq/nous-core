import { describe, expect, it } from 'vitest';
import type { IDocumentStore } from '@nous/shared';
import { DocumentArtifactStore } from '../document-artifact-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655442101';
const RUN_ID = '550e8400-e29b-41d4-a716-446655442102';
const NODE_ID = '550e8400-e29b-41d4-a716-446655442103';

function createMemoryDocumentStore(): IDocumentStore {
  const collections = new Map<string, Map<string, unknown>>();

  const getCollection = (name: string): Map<string, unknown> => {
    const existing = collections.get(name);
    if (existing) {
      return existing;
    }
    const created = new Map<string, unknown>();
    collections.set(name, created);
    return created;
  };

  return {
    async put<T>(collection: string, id: string, document: T): Promise<void> {
      getCollection(collection).set(id, document);
    },
    async get<T>(collection: string, id: string): Promise<T | null> {
      return (getCollection(collection).get(id) as T | undefined) ?? null;
    },
    async query<T>(collection: string): Promise<T[]> {
      return Array.from(getCollection(collection).values()) as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return getCollection(collection).delete(id);
    },
  };
}

describe('DocumentArtifactStore', () => {
  it('stores committed artifacts, retrieves them, and preserves lineage', async () => {
    const store = new DocumentArtifactStore(createMemoryDocumentStore(), {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const stored = await store.store({
      projectId: PROJECT_ID as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'hello world',
      contentEncoding: 'utf8',
      lineage: {
        workflowRunId: RUN_ID as any,
        workflowNodeDefinitionId: NODE_ID as any,
        evidenceRefs: ['workflow:evidence'],
      },
      tags: ['draft'],
    });

    expect(stored.committed).toBe(true);
    const retrieved = await store.retrieve({
      projectId: PROJECT_ID as any,
      artifactId: stored.artifactId,
    });

    expect(retrieved?.data).toBe('hello world');
    expect(retrieved?.lineage?.workflowRunId).toBe(RUN_ID);
    expect(retrieved?.artifactRef).toBe(`artifact://${stored.artifactId}/v1`);
  });

  it('lists only the latest committed version by default and all versions when requested', async () => {
    const store = new DocumentArtifactStore(createMemoryDocumentStore(), {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const first = await store.store({
      projectId: PROJECT_ID as any,
      artifactId: '550e8400-e29b-41d4-a716-446655442104' as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'v1',
      contentEncoding: 'utf8',
      tags: ['draft'],
    });
    await store.store({
      projectId: PROJECT_ID as any,
      artifactId: first.artifactId,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'v2',
      contentEncoding: 'utf8',
      tags: ['draft', 'latest'],
    });

    const visible = await store.list(PROJECT_ID as any);
    const allVersions = await store.list(PROJECT_ID as any, {
      includeAllVersions: true,
    });

    expect(visible).toHaveLength(1);
    expect(visible[0]?.version).toBe(2);
    expect(allVersions).toHaveLength(2);
  });

  it('deletes exact versions or entire artifacts within project scope', async () => {
    const store = new DocumentArtifactStore(createMemoryDocumentStore(), {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const stored = await store.store({
      projectId: PROJECT_ID as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'hello world',
      contentEncoding: 'utf8',
      tags: [],
    });

    const deleted = await store.delete({
      projectId: PROJECT_ID as any,
      artifactId: stored.artifactId,
    });

    expect(deleted).toBe(true);
    expect(
      await store.retrieve({
        projectId: PROJECT_ID as any,
        artifactId: stored.artifactId,
      }),
    ).toBeNull();
  });
});
