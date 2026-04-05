import { describe, expect, it, vi } from 'vitest';
import {
  ProjectConfigSchema,
  type IIngressGateway,
  type IProjectStore,
  type ProjectConfig,
} from '@nous/shared';
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

const projectConfig = ProjectConfigSchema.parse({
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
});

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

  it('upserts schedules without delete/recreate churn', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441108' as any,
        dispatch_ref: 'dispatch:upsert',
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
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const created = await service.upsert({
      projectId: PROJECT_ID as any,
      workflowDefinitionId: WORKFLOW_ID as any,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
      enabled: true,
      requestedDeliveryMode: 'none',
    });
    const updated = await service.upsert({
      id: created.id,
      projectId: PROJECT_ID as any,
      workflowDefinitionId: WORKFLOW_ID as any,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '30 * * * *',
      },
      enabled: true,
      requestedDeliveryMode: 'none',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.trigger).toEqual({
      kind: 'cron',
      cron: '30 * * * *',
    });
  });

  // --- Task schedule adaptation tests ---

  const TASK_ID = '550e8400-e29b-41d4-a716-446655441201';

  const taskDefinition = {
    id: TASK_ID,
    name: 'Heartbeat Task',
    trigger: { type: 'heartbeat' as const, cronExpression: '*/15 * * * *', timezone: 'UTC' },
    orchestratorInstructions: 'Run heartbeat task',
    description: '',
    enabled: true,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
  };

  function createTaskStore(tasks = [taskDefinition]) {
    return {
      get: vi.fn(async (_pid: string, taskId: string) => tasks.find((t) => t.id === taskId) ?? null),
      listByProject: vi.fn(async () => tasks),
      save: vi.fn(async (_pid: string, t: any) => t),
      delete: vi.fn(async () => true),
    } as any;
  }

  const projectConfigWithTask = ProjectConfigSchema.parse({
    id: PROJECT_ID,
    name: 'Task Project',
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
          name: 'Workflow',
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
  });

  it('registers task-only schedules (with taskDefinitionId, without workflowDefinitionId)', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441301' as any,
        dispatch_ref: 'dispatch:task',
        workflow_ref: TASK_ID,
        policy_ref: 'policy:task',
        evidence_ref: 'evidence:task',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfigWithTask as any),
      taskStore: createTaskStore(),
      ingressGateway,
      envelopeBuilder: new IngressEnvelopeBuilder(
        () => new Date('2026-03-08T00:00:00.000Z'),
      ),
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const scheduleId = await service.register({
      id: '550e8400-e29b-41d4-a716-446655441302',
      projectId: PROJECT_ID as any,
      taskDefinitionId: TASK_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '*/15 * * * *',
      },
      enabled: true,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const stored = await scheduleStore.get(scheduleId);
    expect(stored).not.toBeNull();
    expect(stored?.taskDefinitionId).toBe(TASK_ID);
    expect(stored?.workflowDefinitionId).toBeUndefined();
  });

  it('rejects task schedule when task does not exist in project', async () => {
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfigWithTask as any),
      taskStore: createTaskStore(),
      ingressGateway: { submit: vi.fn() },
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    await expect(
      service.register({
        id: '550e8400-e29b-41d4-a716-446655441303',
        projectId: PROJECT_ID as any,
        taskDefinitionId: '550e8400-e29b-41d4-a716-446655449999', // non-existent
        workmodeId: 'system:implementation',
        trigger: {
          kind: 'cron',
          cron: '*/15 * * * *',
        },
        enabled: true,
        createdAt: '2026-03-08T00:00:00.000Z',
        updatedAt: '2026-03-08T00:00:00.000Z',
      } as any),
    ).rejects.toThrow(/not found/i);
  });

  it('dispatches task schedule with task_ref in envelope (not workflow_ref)', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async (envelope) => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441304' as any,
        dispatch_ref: `dispatch:${envelope.idempotency_key}`,
        workflow_ref: envelope.task_ref ?? envelope.workflow_ref ?? '',
        policy_ref: 'policy:task',
        evidence_ref: 'evidence:task',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    await scheduleStore.save({
      id: '550e8400-e29b-41d4-a716-446655441305',
      projectId: PROJECT_ID,
      taskDefinitionId: TASK_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '*/15 * * * *',
      },
      enabled: true,
      nextDueAt: '2026-03-08T00:15:00.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfigWithTask as any),
      ingressGateway,
      now: () => new Date('2026-03-08T00:15:00.000Z'),
    });

    const results = await service.dispatchDueSchedules('2026-03-08T00:15:00.000Z');

    expect(results).toHaveLength(1);
    const submittedEnvelope = vi.mocked(ingressGateway.submit).mock.calls[0]?.[0];
    expect(submittedEnvelope?.task_ref).toBe(TASK_ID);
    expect(submittedEnvelope?.workflow_ref).toBeUndefined();
    expect(submittedEnvelope?.trigger_type).toBe('scheduler');
  });

  it('upserts task schedule with taskDefinitionId', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async () => ({
        outcome: 'accepted_dispatched' as const,
        run_id: '550e8400-e29b-41d4-a716-446655441306' as any,
        dispatch_ref: 'dispatch:upsert-task',
        workflow_ref: TASK_ID,
        policy_ref: 'policy:task',
        evidence_ref: 'evidence:task',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    const service = new SchedulerService({
      scheduleStore,
      projectStore: createProjectStore(projectConfigWithTask as any),
      taskStore: createTaskStore(),
      ingressGateway,
      now: () => new Date('2026-03-08T00:00:00.000Z'),
    });

    const created = await service.upsert({
      projectId: PROJECT_ID as any,
      taskDefinitionId: TASK_ID,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'cron',
        cron: '0 * * * *',
      },
      enabled: true,
      requestedDeliveryMode: 'none',
    });

    expect(created.taskDefinitionId).toBe(TASK_ID);
    expect(created.workflowDefinitionId).toBeUndefined();
  });
});
