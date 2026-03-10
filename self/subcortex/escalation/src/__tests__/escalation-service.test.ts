import { describe, expect, it } from 'vitest';
import type { IProjectStore } from '@nous/shared';
import { DocumentEscalationStore } from '../document-escalation-store.js';
import { EscalationService } from '../escalation-service.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440510';

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

function createProjectStore(): IProjectStore {
  return {
    async create(): Promise<any> {
      return PROJECT_ID;
    },
    async get(id) {
      if (id !== PROJECT_ID) {
        return null;
      }

      return {
        id: PROJECT_ID,
        name: 'Escalation Project',
        type: 'hybrid',
        pfcTier: 3,
        memoryAccessPolicy: {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: true,
        },
        escalationChannels: ['in-app'],
        escalationPreferences: {
          routeByPriority: {
            low: ['projects'],
            medium: ['projects'],
            high: ['projects', 'chat'],
            critical: ['projects', 'chat', 'mao'],
          },
          acknowledgementSurfaces: ['projects', 'chat'],
          mirrorToChat: true,
        },
        retrievalBudgetTokens: 500,
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:00.000Z',
      } as any;
    },
    async list() {
      return [];
    },
    async update(): Promise<void> {},
    async archive(): Promise<void> {},
  };
}

describe('EscalationService', () => {
  it('creates canonical in-app queue items and derives route targets from project preferences', async () => {
    const escalationStore = new DocumentEscalationStore(createMemoryDocumentStore() as any);
    const service = new EscalationService({
      escalationStore,
      projectStore: createProjectStore(),
      now: () => new Date('2026-03-09T00:00:00.000Z'),
    });

    const escalationId = await service.notify({
      context: 'Workflow blocked',
      triggerReason: 'review_required',
      requiredAction: 'Review and resume',
      channel: 'in-app',
      projectId: PROJECT_ID as any,
      priority: 'critical',
      timestamp: '2026-03-09T00:00:00.000Z',
    });

    const record = await service.get(escalationId);
    expect(record?.routeTargets).toEqual(['projects', 'chat', 'mao']);
    expect(record?.status).toBe('visible');
  });

  it('acknowledges queue items without duplicating the same surface acknowledgement', async () => {
    const escalationStore = new DocumentEscalationStore(createMemoryDocumentStore() as any);
    const service = new EscalationService({
      escalationStore,
      projectStore: createProjectStore(),
      now: () => new Date('2026-03-09T00:00:00.000Z'),
    });

    const escalationId = await service.notify({
      context: 'Workflow blocked',
      triggerReason: 'review_required',
      requiredAction: 'Review and resume',
      channel: 'in-app',
      projectId: PROJECT_ID as any,
      priority: 'high',
      timestamp: '2026-03-09T00:00:00.000Z',
    });

    const firstAck = await service.acknowledge({
      escalationId,
      surface: 'projects',
      actorType: 'principal',
      note: 'Handled from Projects',
    });
    const secondAck = await service.acknowledge({
      escalationId,
      surface: 'projects',
      actorType: 'principal',
      note: 'Handled from Projects',
    });

    expect(firstAck?.status).toBe('acknowledged');
    expect(firstAck?.acknowledgements).toHaveLength(1);
    expect(secondAck?.acknowledgements).toHaveLength(1);
  });

  it('produces legacy escalation responses from acknowledgements', async () => {
    const escalationStore = new DocumentEscalationStore(createMemoryDocumentStore() as any);
    const service = new EscalationService({
      escalationStore,
      projectStore: createProjectStore(),
      now: () => new Date('2026-03-09T00:00:00.000Z'),
    });

    const escalationId = await service.notify({
      context: 'Workflow blocked',
      triggerReason: 'review_required',
      requiredAction: 'Review and resume',
      channel: 'in-app',
      projectId: PROJECT_ID as any,
      priority: 'high',
      timestamp: '2026-03-09T00:00:00.000Z',
    });
    await service.acknowledge({
      escalationId,
      surface: 'chat',
      actorType: 'principal',
      note: 'Handled from chat',
    });

    const response = await service.checkResponse(escalationId);
    expect(response?.action).toBe('acknowledged');
    expect(response?.channel).toBe('in-app');
  });
});
