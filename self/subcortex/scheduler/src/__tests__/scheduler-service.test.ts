import { describe, expect, it, vi } from 'vitest';
import type { IIngressGateway, IProjectStore, ProjectConfig } from '@nous/shared';
import { DocumentScheduleStore } from '../document-schedule-store.js';
import { IngressEnvelopeBuilder } from '../ingress-envelope-builder.js';
import { SchedulerService } from '../scheduler-service.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441101';
const WORKFLOW_ID = '550e8400-e29b-41d4-a716-446655441102';
const SCHEDULE_ID = '550e8400-e29b-41d4-a716-446655441103';

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
  name: 'Scheduler Project',
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
        name: 'Scheduled Workflow',
        entryNodeIds: ['550e8400-e29b-41d4-a716-446655441104'],
        nodes: [
          {
            id: '550e8400-e29b-41d4-a716-446655441104',
            name: 'Draft',
            type: 'model-call' as const,
            governance: 'must' as const,
            executionModel: 'synchronous' as const,
            config: {
              type: 'model-call' as const,
              modelRole: 'reasoner' as const,
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

function createSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    projectId: PROJECT_ID,
    workflowDefinitionId: WORKFLOW_ID,
    workmodeId: 'system:implementation',
    trigger: {
      kind: 'cron' as const,
      cron: '*/15 * * * *',
    },
    enabled: true,
    requestedDeliveryMode: 'announce' as const,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('SchedulerService', () => {
  it('registers schedules and computes an initial due cursor for cron triggers', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441105' as any,
        dispatch_ref: 'dispatch:1',
        workflow_ref: WORKFLOW_ID,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:workflow',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfig as any),
      ingressGateway,
      envelopeBuilder: new IngressEnvelopeBuilder(
        () => new Date('2026-03-08T00:00:00.000Z'),
      ),
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const scheduleId = await service.register(createSchedule() as any);
    const stored = await scheduleStore.get(scheduleId);

    expect(stored?.nextDueAt).toBe('2026-03-08T00:15:00.000Z');
  });

  it('dispatches due schedules through the ingress gateway and advances the due cursor', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async (envelope) => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441106' as any,
        dispatch_ref: `dispatch:${envelope.idempotency_key}`,
        workflow_ref: envelope.workflow_ref,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:workflow',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    await scheduleStore.save(createSchedule({
      nextDueAt: '2026-03-08T00:15:00.000Z',
    }) as any);

    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfig as any),
      ingressGateway,
      now: () => new Date('2026-03-08T00:15:00.000Z'),
    });

    const results = await service.dispatchDueSchedules('2026-03-08T00:15:00.000Z');

    expect(results).toHaveLength(1);
    expect(vi.mocked(ingressGateway.submit).mock.calls[0]?.[0]).toMatchObject({
      trigger_type: 'scheduler',
      workmode_id: 'system:implementation',
      requested_delivery_mode: 'announce',
      workflow_ref: WORKFLOW_ID,
    });
    expect(results[0]?.schedule.lastDispatchedAt).toBe('2026-03-08T00:15:00.000Z');
    expect(results[0]?.schedule.nextDueAt).toBe('2026-03-08T00:30:00.000Z');
  });

  it('submits hook and system-event triggers through the canonical gateway seam', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async (envelope) => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441107' as any,
        dispatch_ref: `dispatch:${envelope.idempotency_key}`,
        workflow_ref: envelope.workflow_ref,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:workflow',
      })),
    };

    const service = new SchedulerService({
      scheduleStore: new DocumentScheduleStore(createMemoryDocumentStore() as any),
      projectStore: createProjectStore(projectConfig as any),
      ingressGateway,
      now: () => new Date('2026-03-08T00:20:00.000Z'),
    });

    await service.dispatchHookTrigger({
      projectId: PROJECT_ID as any,
      workmodeId: 'system:implementation',
      sourceId: 'hook://project',
      eventName: 'project.updated',
      idempotencyKey: 'hook:project.updated:1',
      payload: { updated: true },
    });
    await service.dispatchSystemEvent({
      projectId: PROJECT_ID as any,
      workmodeId: 'system:implementation',
      sourceId: 'system://recovery',
      eventName: 'recovery.tick',
      idempotencyKey: 'system:recovery.tick:1',
      payload: { recovery: true },
    });

    expect(vi.mocked(ingressGateway.submit).mock.calls).toHaveLength(2);
    expect(vi.mocked(ingressGateway.submit).mock.calls[0]?.[0]?.trigger_type).toBe('hook');
    expect(vi.mocked(ingressGateway.submit).mock.calls[1]?.[0]?.trigger_type).toBe(
      'system_event',
    );
  });
});
