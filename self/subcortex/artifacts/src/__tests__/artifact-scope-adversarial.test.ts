import { describe, expect, it } from 'vitest';
import type { IDocumentStore } from '@nous/shared';
import {
  ARTIFACT_PAYLOAD_COLLECTION,
  DocumentArtifactStore,
} from '../document-artifact-store.js';

const PROJECT_A = '550e8400-e29b-41d4-a716-446655442301';
const PROJECT_B = '550e8400-e29b-41d4-a716-446655442302';

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

describe('artifact scope and integrity adversarial behavior', () => {
  it('denies cross-project retrieve and delete operations', async () => {
    const store = new DocumentArtifactStore(createMemoryDocumentStore(), {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const stored = await store.store({
      projectId: PROJECT_A as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'hello world',
      contentEncoding: 'utf8',
      tags: [],
    });

    expect(
      await store.retrieve({
        projectId: PROJECT_B as any,
        artifactId: stored.artifactId,
      }),
    ).toBeNull();
    expect(
      await store.delete({
        projectId: PROJECT_B as any,
        artifactId: stored.artifactId,
      }),
    ).toBe(false);
  });

  it('fails retrieval closed when payload integrity no longer matches the manifest', async () => {
    const documentStore = createMemoryDocumentStore();
    const store = new DocumentArtifactStore(documentStore, {
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const stored = await store.store({
      projectId: PROJECT_A as any,
      name: 'draft.txt',
      mimeType: 'text/plain',
      data: 'hello world',
      contentEncoding: 'utf8',
      tags: [],
    });

    await documentStore.put(ARTIFACT_PAYLOAD_COLLECTION, `${stored.artifactId}:v1`, {
      id: `${stored.artifactId}:v1`,
      artifactId: stored.artifactId,
      projectId: PROJECT_A,
      version: 1,
      contentEncoding: 'utf8',
      dataBase64: Buffer.from('tampered payload', 'utf8').toString('base64'),
    });

    expect(
      await store.retrieve({
        projectId: PROJECT_A as any,
        artifactId: stored.artifactId,
      }),
    ).toBeNull();
  });
});
