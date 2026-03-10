import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentArtifactStore } from '../document-artifact-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655442201';

describe('artifact store integration', () => {
  it('persists manifests and payloads through the document-store-backed implementation', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'nous-artifacts-'));
    const documentStore = new SqliteDocumentStore(join(tempDir, 'artifacts.db'));
    try {
      const store = new DocumentArtifactStore(documentStore, {
        now: () => new Date('2026-03-08T00:00:00.000Z'),
      });

      const stored = await store.store({
        projectId: PROJECT_ID as any,
        name: 'draft.txt',
        mimeType: 'text/plain',
        data: 'integration payload',
        contentEncoding: 'utf8',
        tags: ['integration'],
      });

      const retrieved = await store.retrieve({
        projectId: PROJECT_ID as any,
        artifactId: stored.artifactId,
      });

      expect(stored.committed).toBe(true);
      expect(retrieved?.data).toBe('integration payload');
      expect(
        await store.delete({
          projectId: PROJECT_ID as any,
          artifactId: stored.artifactId,
        }),
      ).toBe(true);
    } finally {
      documentStore.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
