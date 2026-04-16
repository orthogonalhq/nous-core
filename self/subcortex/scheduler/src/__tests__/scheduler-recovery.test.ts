import { describe, expect, it, vi } from 'vitest';
import type { IIngressGateway, IProjectStore, ProjectConfig } from '@nous/shared';
import { DocumentScheduleStore } from '../document-schedule-store.js';
import { SchedulerService } from '../scheduler-service.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441301';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441302';

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
    async query<T>(collection: string): Promise<T[]> {
      return Array.from(collections.get(collection)?.values() ?? []) as T[];
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return collections.get(collection)?.delete(id) ?? false;
    },
  };
}

function createProjectStore(projectConfig: ProjectConfig): IProjectStore {
  return {
    async create(): Promise<any> {
      return projectConfig.id;
    },
    async get(id) {
      return id === projectConfig.id ? projectConfig : null;
    },
    async list() {
      return [projectConfig];
    },
    async update(): Promise<void> {},
    async archive(): Promise<void> {},
  };
}

const projectConfig = {
  id: PROJECT_ID,
  name: 'Scheduler Recovery Project',
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
        name: 'Recovery Workflow',
        entryNodeIds: ['550e8400-e29b-41d4-a716-446655441303'],
        nodes: [
          {
            id: '550e8400-e29b-41d4-a716-446655441303',
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call' as const,
              modelRole: 'cortex-chat' as const,
              promptRef: 'prompt://draft',
            },
          },
        ],
        edges: [],
      },
    ],
  },
  retrievalBudgetTokens: 500,
  createdAt: '2026-03-08T00:00:00.000Z',
  updatedAt: '2026-03-08T00:00:00.000Z',
} as const;

describe('scheduler recovery behavior', () => {
  it('recomputes missing due cursors for enabled cron schedules', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441304' as any,
        dispatch_ref: 'dispatch:1',
        workflow_ref: WORKFLOW_ID,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:workflow',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    await scheduleStore.save({
      id: '550e8400-e29b-41d4-a716-446655441305',
      projectId: PROJECT_ID,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
      enabled: true,
      requestedDeliveryMode: 'none',
      nextDueAt: null,
      lastDispatchedAt: '2026-03-08T00:00:00.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfig as any),
      ingressGateway,
      now: () => new Date('2026-03-08T00:10:00.000Z'),
    });

    const results = await service.dispatchDueSchedules('2026-03-08T00:10:00.000Z');
    const persisted = await scheduleStore.get('550e8400-e29b-41d4-a716-446655441305');

    expect(results).toHaveLength(0);
    expect(persisted?.nextDueAt).toBe('2026-03-08T01:00:00.000Z');
  });

  it('advances the schedule cursor after duplicate-safe redispatch on restart', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_already_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441306' as any,
        dispatch_ref: 'dispatch:existing',
        evidence_ref: 'evidence:existing',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    await scheduleStore.save({
      id: '550e8400-e29b-41d4-a716-446655441307',
      projectId: PROJECT_ID,
      workflowDefinitionId: WORKFLOW_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'calendar',
        execute_at: '2026-03-08T00:15:00.000Z',
      },
      enabled: true,
      requestedDeliveryMode: 'none',
      nextDueAt: '2026-03-08T00:15:00.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfig as any),
      ingressGateway,
      now: () => new Date('2026-03-08T00:15:00.000Z'),
    });

    const results = await service.dispatchDueSchedules('2026-03-08T00:15:00.000Z');
    const persisted = await scheduleStore.get('550e8400-e29b-41d4-a716-446655441307');

    expect(results[0]?.outcome.outcome).toBe('accepted_already_dispatched');
    expect(persisted?.enabled).toBe(false);
    expect(persisted?.nextDueAt).toBeNull();
  });
});
