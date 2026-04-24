import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import type { ProjectId } from '@nous/shared';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentProjectStore } from '../document-project-store.js';

const PROJECT_ID = '00000000-0000-0000-0000-000000000001' as ProjectId;
const WORKFLOW_ID = '00000000-0000-0000-0000-000000000010';
const NODE_ID = '00000000-0000-0000-0000-000000000011';
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
  workflow: {
    defaultWorkflowDefinitionId: WORKFLOW_ID,
    definitions: [
      {
        id: WORKFLOW_ID,
        projectId: PROJECT_ID,
        mode: 'hybrid' as const,
        version: '1.0.0',
        name: 'Primary Workflow',
        entryNodeIds: [NODE_ID],
        nodes: [
          {
            id: NODE_ID,
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call',
              modelRole: 'cortex-chat' as const,
              promptRef: 'prompt://draft',
            },
          },
        ],
        edges: [],
      },
    ],
    packageBindings: [],
  },
  retrievalBudgetTokens: 500,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}) as any;

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
    expect(got?.workflow?.defaultWorkflowDefinitionId).toBe(WORKFLOW_ID);
    expect(got?.governanceDefaults.defaultNodeGovernance).toBe('must');
    expect(got?.escalationPreferences.mirrorToChat).toBe(true);
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

  it('unarchive() flips status back to active and bumps updatedAt', async () => {
    await store.create(createProjectConfig());
    await store.archive(PROJECT_ID);

    const beforeUnarchive = await store.get(PROJECT_ID);
    expect(beforeUnarchive).not.toBeNull();

    // Small async gap so `new Date().toISOString()` yields a different stamp.
    await new Promise((resolve) => setTimeout(resolve, 2));

    await store.unarchive(PROJECT_ID);

    const list = await store.list();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe('Test Project');

    const got = await store.get(PROJECT_ID);
    expect(got).not.toBeNull();
    expect(got?.updatedAt).not.toBe(beforeUnarchive?.updatedAt);
  });

  it('unarchive() throws on missing project', async () => {
    await expect(
      store.unarchive(
        '00000000-0000-0000-0000-000000000099' as ProjectId,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('archive -> unarchive -> list round-trip returns project to active list', async () => {
    await store.create(createProjectConfig());
    await store.archive(PROJECT_ID);
    expect((await store.list()).length).toBe(0);

    await store.unarchive(PROJECT_ID);
    const list = await store.list();
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(PROJECT_ID);
  });

  it('listArchived() returns only archived projects (WR-163 SDS Decision C)', async () => {
    // Seed one archived project + one active project.
    const ARCHIVED_ID = '00000000-0000-0000-0000-000000000050' as ProjectId;
    const activeConfig = createProjectConfig();
    const archivedConfig = { ...createProjectConfig(), id: ARCHIVED_ID, name: 'Archived Project' };

    await store.create(activeConfig);
    await store.create(archivedConfig);
    await store.archive(ARCHIVED_ID);

    const archivedList = await store.listArchived();
    expect(archivedList.length).toBe(1);
    expect(archivedList[0]?.id).toBe(ARCHIVED_ID);
    expect(archivedList[0]?.name).toBe('Archived Project');

    // Active list remains unaffected by listArchived.
    const activeList = await store.list();
    expect(activeList.length).toBe(1);
    expect(activeList[0]?.id).toBe(PROJECT_ID);
  });

  it('listArchived() returns empty when no projects are archived', async () => {
    await store.create(createProjectConfig());
    const archivedList = await store.listArchived();
    expect(archivedList.length).toBe(0);
  });

  it('update() merges changes', async () => {
    await store.create(createProjectConfig());
    await store.update(PROJECT_ID, {
      name: 'Updated Name',
      escalationPreferences: {
        routeByPriority: {
          low: ['projects'],
          medium: ['projects'],
          high: ['projects', 'chat', 'mobile'],
          critical: ['projects', 'chat', 'mao', 'mobile'],
        },
        acknowledgementSurfaces: ['projects', 'chat', 'mobile'],
        mirrorToChat: false,
      },
    } as any);

    const got = await store.get(PROJECT_ID);
    expect(got?.name).toBe('Updated Name');
    expect(got?.workflow?.definitions).toHaveLength(1);
    expect(got?.escalationPreferences.mirrorToChat).toBe(false);
  });

  it('update() preserves workflow definitions when updating workflow', async () => {
    await store.create(createProjectConfig());
    await store.update(PROJECT_ID, {
      workflow: {
        defaultWorkflowDefinitionId: WORKFLOW_ID,
        definitions: [
          {
            id: WORKFLOW_ID,
            projectId: PROJECT_ID,
            mode: 'hybrid',
            version: '1.0.1',
            name: 'Primary Workflow',
            entryNodeIds: [NODE_ID],
            nodes: [
              {
                id: NODE_ID,
                name: 'Draft',
                type: 'model-call',
                governance: 'must',
                executionModel: 'synchronous',
                config: {
                  type: 'model-call',
                  modelRole: 'cortex-chat',
                  promptRef: 'prompt://draft-v2',
                },
              },
            ],
            edges: [],
          },
        ],
        packageBindings: [],
      },
    } as any);

    const got = await store.get(PROJECT_ID);
    expect(got?.workflow?.definitions[0]?.version).toBe('1.0.1');
    expect(got?.workflow?.definitions[0]?.nodes[0]?.config).toEqual({
      type: 'model-call',
      modelRole: 'cortex-chat',
      promptRef: 'prompt://draft-v2',
    });
  });
});
