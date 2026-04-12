import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus, NotificationRecord, RaiseNotificationInput } from '@nous/shared';
import { NotificationService } from '../notification-service.js';
import { DocumentNotificationStore } from '../document-notification-store.js';

// --- Helpers ---

function createMockStore(): DocumentNotificationStore {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    query: vi.fn().mockResolvedValue([]),
    countByStatus: vi.fn().mockResolvedValue(0),
    deleteExpiredTransient: vi.fn().mockResolvedValue(0),
  } as unknown as DocumentNotificationStore;
}

function createMockEventBus(): IEventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as IEventBus;
}

const FIXED_NOW = new Date('2026-04-10T12:00:00.000Z');

function makeToastInput(overrides: Partial<RaiseNotificationInput> = {}): RaiseNotificationInput {
  return {
    kind: 'toast',
    projectId: 'proj-1',
    title: 'Test toast',
    message: 'Test message',
    transient: true,
    source: 'test-source',
    toast: {
      severity: 'info',
      dismissible: true,
      durationMs: 8000,
    },
    ...overrides,
  } as RaiseNotificationInput;
}

function makeAlertInput(): RaiseNotificationInput {
  return {
    kind: 'alert',
    projectId: 'proj-1',
    title: 'Budget warning',
    message: 'You are at 80%',
    transient: false,
    source: 'cost-governance',
    alert: {
      category: 'budget-warning',
      utilizationPercent: 80,
      currentSpendUsd: 8,
      budgetCeilingUsd: 10,
    },
  } as RaiseNotificationInput;
}

function makeHealthInput(): RaiseNotificationInput {
  return {
    kind: 'health',
    projectId: null,
    title: 'CPU high',
    message: 'CPU usage is above threshold',
    transient: false,
    source: 'health-monitor',
    health: {
      issueId: 'issue-1',
      severity: 'warning',
    },
  } as RaiseNotificationInput;
}

function makePanelInput(): RaiseNotificationInput {
  return {
    kind: 'panel',
    projectId: 'proj-1',
    title: 'Panel alert',
    message: 'Something happened in the panel',
    transient: false,
    source: 'panel-bridge',
    panel: {
      panelId: 'panel-1',
      level: 'warning',
    },
  } as RaiseNotificationInput;
}

function makeEscalationInput(): RaiseNotificationInput {
  return {
    kind: 'escalation',
    projectId: 'proj-1',
    title: 'Escalation',
    message: 'Needs attention',
    transient: false,
    source: 'workflow',
    escalation: {
      escalationId: '00000000-0000-0000-0000-000000000050',
      severity: 'high',
      source: 'workflow',
      status: 'visible',
      routeTargets: ['projects'],
    },
  } as RaiseNotificationInput;
}

// --- Tests ---

describe('NotificationService', () => {
  let mockStore: DocumentNotificationStore;
  let mockEventBus: IEventBus;
  let service: NotificationService;

  beforeEach(() => {
    mockStore = createMockStore();
    mockEventBus = createMockEventBus();
    service = new NotificationService({
      notificationStore: mockStore,
      eventBus: mockEventBus,
      now: () => FIXED_NOW,
    });
  });

  describe('raise()', () => {
    it('generates UUID id, sets status active, sets timestamps, persists, publishes notification:raised', async () => {
      const input = makeToastInput();
      const result = await service.raise(input);

      expect(result.id).toBeDefined();
      expect(result.status).toBe('active');
      expect(result.createdAt).toBe(FIXED_NOW.toISOString());
      expect(result.updatedAt).toBe(FIXED_NOW.toISOString());
      expect(mockStore.save).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'notification:raised',
        expect.objectContaining({
          id: result.id,
          kind: 'toast',
          projectId: 'proj-1',
          title: 'Test toast',
          source: 'test-source',
        }),
      );
    });

    it('derives level correctly for toast kind', async () => {
      const result = await service.raise(makeToastInput());
      expect(result.level).toBe('info');
    });

    it('derives level correctly for alert kind (budget-warning -> warning)', async () => {
      const result = await service.raise(makeAlertInput());
      expect(result.level).toBe('warning');
    });

    it('derives level correctly for alert kind (budget-exceeded -> error)', async () => {
      const input: RaiseNotificationInput = {
        kind: 'alert',
        projectId: 'proj-1',
        title: 'Budget exceeded',
        message: 'You exceeded budget',
        transient: false,
        source: 'cost-governance',
        alert: {
          category: 'budget-exceeded',
          utilizationPercent: 110,
          currentSpendUsd: 11,
          budgetCeilingUsd: 10,
        },
      };
      const result = await service.raise(input);
      expect(result.level).toBe('error');
    });

    it('derives level correctly for health kind', async () => {
      const result = await service.raise(makeHealthInput());
      expect(result.level).toBe('warning');
    });

    it('derives level correctly for panel kind (warning -> warning)', async () => {
      const result = await service.raise(makePanelInput());
      expect(result.level).toBe('warning');
    });

    it('derives level correctly for escalation kind (high -> error)', async () => {
      const result = await service.raise(makeEscalationInput());
      expect(result.level).toBe('error');
    });

    it('dedup: returns existing record when source+title+projectId+kind match within 60s window', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000099',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test toast',
        message: 'Test message',
        status: 'active',
        transient: true,
        source: 'test-source',
        createdAt: '2026-04-10T11:59:30.000Z', // 30s ago
        updatedAt: '2026-04-10T11:59:30.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.query).mockResolvedValue([existing]);

      const result = await service.raise(makeToastInput());

      expect(result).toEqual(existing);
      expect(mockStore.save).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('dedup: creates new record when outside 60s window', async () => {
      const old: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000099',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test toast',
        message: 'Test message',
        status: 'active',
        transient: true,
        source: 'test-source',
        createdAt: '2026-04-10T10:00:00.000Z', // 2 hours ago
        updatedAt: '2026-04-10T10:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.query).mockResolvedValue([old]);

      const result = await service.raise(makeToastInput());

      expect(result.id).not.toBe(old.id);
      expect(mockStore.save).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledOnce();
    });

    it('dedup: creates new record when source differs', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000099',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test toast',
        message: 'Test message',
        status: 'active',
        transient: true,
        source: 'different-source',
        createdAt: '2026-04-10T11:59:30.000Z',
        updatedAt: '2026-04-10T11:59:30.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.query).mockResolvedValue([existing]);

      const result = await service.raise(makeToastInput());

      expect(result.id).not.toBe(existing.id);
      expect(mockStore.save).toHaveBeenCalledOnce();
    });

    it('dedup: creates new record when title differs', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000099',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Different title',
        message: 'Test message',
        status: 'active',
        transient: true,
        source: 'test-source',
        createdAt: '2026-04-10T11:59:30.000Z',
        updatedAt: '2026-04-10T11:59:30.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.query).mockResolvedValue([existing]);

      const result = await service.raise(makeToastInput());

      expect(result.id).not.toBe(existing.id);
      expect(mockStore.save).toHaveBeenCalledOnce();
    });

    it('works without event bus (optional chaining)', async () => {
      const serviceNoEvents = new NotificationService({
        notificationStore: mockStore,
        now: () => FIXED_NOW,
      });

      const result = await serviceNoEvents.raise(makeToastInput());

      expect(result.status).toBe('active');
      expect(mockStore.save).toHaveBeenCalledOnce();
    });

    it('handles projectId: null correctly', async () => {
      const input = makeHealthInput(); // projectId is null
      const result = await service.raise(input);

      expect(result.projectId).toBeNull();
      expect(result.status).toBe('active');
    });

    it('dedup with projectId: null matches correctly', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000099',
        kind: 'health',
        projectId: null,
        level: 'warning',
        title: 'CPU high',
        message: 'CPU usage is above threshold',
        status: 'active',
        transient: false,
        source: 'health-monitor',
        createdAt: '2026-04-10T11:59:30.000Z',
        updatedAt: '2026-04-10T11:59:30.000Z',
        health: { issueId: 'issue-1', severity: 'warning' },
      } as NotificationRecord;

      vi.mocked(mockStore.query).mockResolvedValue([existing]);

      const result = await service.raise(makeHealthInput());
      expect(result).toEqual(existing);
      expect(mockStore.save).not.toHaveBeenCalled();
    });
  });

  describe('acknowledge()', () => {
    it('transitions active to acknowledged, updates updatedAt, publishes notification:updated', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'active',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.acknowledge(existing.id);

      expect(result.status).toBe('acknowledged');
      expect(result.updatedAt).toBe(FIXED_NOW.toISOString());
      expect(mockStore.save).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'notification:updated',
        {
          id: existing.id,
          status: 'acknowledged',
          previousStatus: 'active',
        },
      );
    });

    it('is no-op for already-acknowledged records (returns existing)', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'acknowledged',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:30:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.acknowledge(existing.id);

      expect(result).toEqual(existing);
      expect(mockStore.save).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('is no-op for dismissed records (returns existing)', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'dismissed',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:30:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.acknowledge(existing.id);

      expect(result).toEqual(existing);
      expect(mockStore.save).not.toHaveBeenCalled();
    });

    it('throws for non-existent ID', async () => {
      vi.mocked(mockStore.get).mockResolvedValue(null);

      await expect(service.acknowledge('nonexistent')).rejects.toThrow(
        'Notification nonexistent not found',
      );
    });
  });

  describe('dismiss()', () => {
    it('transitions active to dismissed, updates updatedAt, publishes notification:updated', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'active',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.dismiss(existing.id);

      expect(result.status).toBe('dismissed');
      expect(result.updatedAt).toBe(FIXED_NOW.toISOString());
      expect(mockStore.save).toHaveBeenCalledOnce();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'notification:updated',
        {
          id: existing.id,
          status: 'dismissed',
          previousStatus: 'active',
        },
      );
    });

    it('transitions acknowledged to dismissed', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'acknowledged',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:30:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.dismiss(existing.id);

      expect(result.status).toBe('dismissed');
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'notification:updated',
        expect.objectContaining({ previousStatus: 'acknowledged' }),
      );
    });

    it('is no-op for already-dismissed records', async () => {
      const existing: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'dismissed',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:30:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(existing);

      const result = await service.dismiss(existing.id);
      expect(result).toEqual(existing);
      expect(mockStore.save).not.toHaveBeenCalled();
    });

    it('throws for non-existent ID', async () => {
      vi.mocked(mockStore.get).mockResolvedValue(null);

      await expect(service.dismiss('nonexistent')).rejects.toThrow(
        'Notification nonexistent not found',
      );
    });
  });

  describe('list()', () => {
    it('delegates to store query() when no projectId filter', async () => {
      const filter = { kind: 'toast' as const };
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await service.list(filter);

      expect(mockStore.query).toHaveBeenCalledWith(filter);
    });

    it('includes system-wide items when filtering by projectId', async () => {
      const projectItem = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast' as const,
        projectId: 'proj-1',
        level: 'info' as const,
        title: 'Project toast',
        message: 'msg',
        status: 'active' as const,
        transient: true,
        source: 'test',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
        toast: { severity: 'info' as const, dismissible: true, durationMs: 8000 },
      };
      const systemItem = { ...projectItem, id: '00000000-0000-0000-0000-000000000002', projectId: null, title: 'System' };
      const otherItem = { ...projectItem, id: '00000000-0000-0000-0000-000000000003', projectId: 'proj-2', title: 'Other' };
      vi.mocked(mockStore.query).mockResolvedValue([projectItem, systemItem, otherItem]);

      const result = await service.list({ projectId: 'proj-1' });

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toContain(projectItem.id);
      expect(result.map((r) => r.id)).toContain(systemItem.id);
    });
  });

  describe('get()', () => {
    it('delegates to store and returns result', async () => {
      const record: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'active',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValue(record);

      const result = await service.get(record.id);
      expect(result).toEqual(record);
    });

    it('returns null for non-existent record', async () => {
      vi.mocked(mockStore.get).mockResolvedValue(null);

      const result = await service.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('countActive()', () => {
    it('counts active notifications', async () => {
      vi.mocked(mockStore.countByStatus).mockResolvedValue(5);

      const count = await service.countActive();

      expect(count).toBe(5);
      expect(mockStore.countByStatus).toHaveBeenCalledWith(
        'active',
        undefined,
      );
    });

    it('includes system-wide items when scoping by projectId', async () => {
      const projectItem = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast' as const,
        projectId: 'proj-1',
        level: 'info' as const,
        title: 'Project',
        message: 'msg',
        status: 'active' as const,
        transient: true,
        source: 'test',
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
        toast: { severity: 'info' as const, dismissible: true, durationMs: 8000 },
      };
      const systemItem = { ...projectItem, id: '00000000-0000-0000-0000-000000000002', projectId: null };
      const otherItem = { ...projectItem, id: '00000000-0000-0000-0000-000000000003', projectId: 'proj-2' };
      vi.mocked(mockStore.query).mockResolvedValue([projectItem, systemItem, otherItem]);

      const count = await service.countActive('proj-1');

      // Counts proj-1 + null, excludes proj-2
      expect(count).toBe(2);
    });
  });

  describe('forward-only transitions', () => {
    it('acknowledge then dismiss produces correct forward-only transition', async () => {
      const active: NotificationRecord = {
        id: '00000000-0000-0000-0000-000000000001',
        kind: 'toast',
        projectId: 'proj-1',
        level: 'info',
        title: 'Test',
        message: 'Msg',
        status: 'active',
        transient: true,
        source: 'src',
        createdAt: '2026-04-10T11:00:00.000Z',
        updatedAt: '2026-04-10T11:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as NotificationRecord;

      vi.mocked(mockStore.get).mockResolvedValueOnce(active);
      const acknowledged = await service.acknowledge(active.id);
      expect(acknowledged.status).toBe('acknowledged');

      vi.mocked(mockStore.get).mockResolvedValueOnce(acknowledged);
      const dismissed = await service.dismiss(active.id);
      expect(dismissed.status).toBe('dismissed');
    });
  });
});
