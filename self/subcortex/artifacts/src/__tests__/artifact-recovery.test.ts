import { describe, expect, it } from 'vitest';
import type { IDocumentStore } from '@nous/shared';
import { DocumentArtifactStore } from '../document-artifact-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655442401';

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

describe('artifact recovery behavior', () => {
  it('keeps prepared versions hidden until they are explicitly committed', async () => {
    const store = new DocumentArtifactStore(createMemoryDocumentStore(), {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
      autoCommit: false,
    });

    const stored = await store.store({
      projectId: PROJECT_ID as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'prepared only',
      contentEncoding: 'utf8',
      tags: ['prepared'],
    });

    expect(stored.committed).toBe(false);
    expect(
      await store.retrieve({
        projectId: PROJECT_ID as any,
        artifactId: stored.artifactId,
      }),
    ).toBeNull();
    expect(await store.list(PROJECT_ID as any)).toHaveLength(0);

    const allVersions = await store.list(PROJECT_ID as any, {
      includeAllVersions: true,
    });
    expect(allVersions).toHaveLength(1);
    expect(allVersions[0]?.writeState).toBe('prepared');

    const committed = await store.commitPreparedVersion({
      projectId: PROJECT_ID as any,
      artifactId: stored.artifactId,
      version: stored.version,
    });

    expect(committed?.committed).toBe(true);
    expect(
      await store.retrieve({
        projectId: PROJECT_ID as any,
        artifactId: stored.artifactId,
      }),
    ).toMatchObject({
      data: 'prepared only',
      writeState: 'committed',
    });
  });
});
