import { describe, expect, it, vi } from 'vitest';
import {
  ProjectConfigSchema,
  type IIngressGateway,
  type IProjectStore,
  type ProjectConfig,
} from '@nous/shared';
import { DocumentScheduleStore } from '../document-schedule-store.js';
import { SchedulerService } from '../scheduler-service.js';

const PROJECT_A = '550e8400-e29b-41d4-a716-446655441301';
const PROJECT_B = '550e8400-e29b-41d4-a716-446655441302';
const WORKFLOW_A = '550e8400-e29b-41d4-a716-446655441303';
const WORKFLOW_B = '550e8400-e29b-41d4-a716-446655441304';
const DUE_AT = '2026-03-08T01:00:00.000Z';

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

function createProjectStore(projects: ProjectConfig[]): IProjectStore {
  return {
    async create(): Promise<any> {
      return null;
    },
    async get(id) {
      return projects.find((project) => project.id === id) ?? null;
    },
    async list() {
      return projects;
    },
    async update(): Promise<void> {},
    async archive(): Promise<void> {},
  };
}

function createProjectConfig(id: string, workflowId: string): ProjectConfig {
  return ProjectConfigSchema.parse({
    id: id as any,
    name: `Project ${id.slice(-4)}`,
    type: 'hybrid',
    pfcTier: 2,
    memoryAccessPolicy: {
      canReadFrom: 'all',
      canBeReadBy: 'all',
      inheritsGlobal: true,
    },
    escalationChannels: ['in-app'],
    workflow: {
      defaultWorkflowDefinitionId: workflowId as any,
      definitions: [
        {
          id: workflowId as any,
          projectId: id as any,
          mode: 'hybrid',
          version: '1.0.0',
          name: 'Knowledge Refresh Workflow',
          entryNodeIds: ['550e8400-e29b-41d4-a716-446655441305' as any],
          nodes: [
            {
              id: '550e8400-e29b-41d4-a716-446655441305' as any,
              name: 'Refresh',
              type: 'tool-execution',
              governance: 'must',
              executionModel: 'synchronous',
              config: {
                type: 'tool-execution',
                toolName: 'refresh_project_knowledge',
                inputMappingRef: 'mapping://refresh-project-knowledge',
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
}

describe('scheduler discovery refresh integration', () => {
  it('dispatches one project-scoped ingress envelope per due refresh schedule and avoids redispatching the same occurrence', async () => {
    const ingressGateway: IIngressGateway = {
      submit: vi.fn(async (envelope) => ({
        outcome: 'accepted_dispatched' as const,
        run_id: `${envelope.project_id}-run` as any,
        dispatch_ref: `dispatch:${envelope.idempotency_key}`,
        workflow_ref: envelope.workflow_ref,
        policy_ref: 'policy:workflow',
        evidence_ref: 'evidence:workflow',
      })),
    };
    const scheduleStore = new DocumentScheduleStore(createMemoryDocumentStore() as any);
    const projectStore = createProjectStore([
      createProjectConfig(PROJECT_A, WORKFLOW_A),
      createProjectConfig(PROJECT_B, WORKFLOW_B),
    ]);

    await scheduleStore.save({
      id: '550e8400-e29b-41d4-a716-446655441306',
      projectId: PROJECT_A as any,
      workflowDefinitionId: WORKFLOW_A as any,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'calendar',
        execute_at: DUE_AT,
      },
      enabled: true,
      requestedDeliveryMode: 'none',
      nextDueAt: DUE_AT,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);
    await scheduleStore.save({
      id: '550e8400-e29b-41d4-a716-446655441307',
      projectId: PROJECT_B as any,
      workflowDefinitionId: WORKFLOW_B as any,
      workmodeId: 'system:implementation',
      trigger: {
        kind: 'calendar',
        execute_at: DUE_AT,
      },
      enabled: true,
      requestedDeliveryMode: 'none',
      nextDueAt: DUE_AT,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
    } as any);

    const service = new SchedulerService({
      scheduleStore,
      projectStore,
      ingressGateway,
      now: () => new Date(DUE_AT),
    });

    const firstDispatch = await service.dispatchDueSchedules(DUE_AT);
    const secondDispatch = await service.dispatchDueSchedules(DUE_AT);

    expect(firstDispatch).toHaveLength(2);
    expect(secondDispatch).toHaveLength(0);

    const envelopes = vi.mocked(ingressGateway.submit).mock.calls.map((call) => call[0]);
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]?.trigger_type).toBe('scheduler');
    expect(envelopes[1]?.trigger_type).toBe('scheduler');
    expect(envelopes[0]?.project_id).toBe(PROJECT_A);
    expect(envelopes[1]?.project_id).toBe(PROJECT_B);
    expect(envelopes[0]?.workflow_ref).toBe(WORKFLOW_A);
    expect(envelopes[1]?.workflow_ref).toBe(WORKFLOW_B);
    expect(envelopes[0]?.source_id).toBe('schedule:550e8400-e29b-41d4-a716-446655441306');
    expect(envelopes[1]?.source_id).toBe('schedule:550e8400-e29b-41d4-a716-446655441307');
    expect(envelopes[0]?.idempotency_key).toBe(
      'schedule:550e8400-e29b-41d4-a716-446655441306:2026-03-08T01:00:00.000Z',
    );
    expect(envelopes[1]?.idempotency_key).toBe(
      'schedule:550e8400-e29b-41d4-a716-446655441307:2026-03-08T01:00:00.000Z',
    );
  });
});
