import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import type { ProjectId } from '@nous/shared';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentProjectStore } from '../document-project-store.js';

const PROJECT_ID = '00000000-0000-0000-0000-000000000001' as ProjectId;
const createProjectConfig = () => ({
  id: PROJECT_ID,
  name: 'Test Project',
  type: 'hybrid' as const,
  pfcTier: 2,
  memoryAccessPolicy: {
    canReadFrom: 'all' as const,
    canBeReadBy: 'all' as const,
    inheritsGlobal: true,
  },
  escalationChannels: ['in-app' as const],
  retrievalBudgetTokens: 500,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('DocumentProjectStore', () => {
  let store: DocumentProjectStore;
  let documentStore: SqliteDocumentStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'nous-doc-project-'));
    const dbPath = join(tempDir, 'test.db');
    documentStore = new SqliteDocumentStore(dbPath);
    store = new DocumentProjectStore(documentStore);
  });

  afterEach(() => {
    documentStore.close();
    rmSync(tempDir, { recursive: true });
  });

  it('implements IProjectStore — create persists project', async () => {
    const config = createProjectConfig();
    const id = await store.create(config);

    expect(id).toBe(PROJECT_ID);
    const got = await store.get(id);
    expect(got).not.toBeNull();
    expect(got?.name).toBe('Test Project');
  });

  it('get() returns null for non-existent project', async () => {
    const got = await store.get(
      '00000000-0000-0000-0000-000000000099' as ProjectId,
    );
    expect(got).toBeNull();
  });

  it('list() returns only active projects', async () => {
    await store.create(createProjectConfig());
    const list = await store.list();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe('Test Project');
  });

  it('archive() sets status and list excludes archived', async () => {
    await store.create(createProjectConfig());
    await store.archive(PROJECT_ID);

    const list = await store.list();
    expect(list.length).toBe(0);

    const got = await store.get(PROJECT_ID);
    expect(got).not.toBeNull();
    expect(got?.name).toBe('Test Project');
  });

  it('update() merges changes', async () => {
    await store.create(createProjectConfig());
    await store.update(PROJECT_ID, { name: 'Updated Name' });

    const got = await store.get(PROJECT_ID);
    expect(got?.name).toBe('Updated Name');
  });
});
