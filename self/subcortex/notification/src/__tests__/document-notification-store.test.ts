import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IDocumentStore, NotificationRecord } from '@nous/shared';
import { DocumentNotificationStore, NOTIFICATION_COLLECTION } from '../document-notification-store.js';

// --- Helpers ---

function createMockDocumentStore(): IDocumentStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as IDocumentStore;
}

function makeToastRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'toast',
    projectId: 'proj-1',
    level: 'info',
    title: 'Test toast',
    message: 'Test message',
    status: 'active',
    transient: true,
    source: 'test-source',
    createdAt: '2026-04-10T12:00:00.000Z',
    updatedAt: '2026-04-10T12:00:00.000Z',
    toast: {
      severity: 'info',
      dismissible: true,
      durationMs: 8000,
    },
    ...overrides,
  } as NotificationRecord;
}

function makeHealthRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    kind: 'health',
    projectId: null,
    level: 'warning',
    title: 'Health check',
    message: 'CPU high',
    status: 'active',
    transient: false,
    source: 'health-monitor',
    createdAt: '2026-04-10T12:00:00.000Z',
    updatedAt: '2026-04-10T12:00:00.000Z',
    health: {
      issueId: 'issue-1',
      severity: 'warning',
    },
    ...overrides,
  } as NotificationRecord;
}

function makeAlertRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: '00000000-0000-0000-0000-000000000003',
    kind: 'alert',
    projectId: 'proj-1',
    level: 'warning',
    title: 'Budget warning',
    message: 'You are at 80%',
    status: 'active',
    transient: false,
    source: 'cost-governance',
    createdAt: '2026-04-10T12:00:00.000Z',
    updatedAt: '2026-04-10T12:00:00.000Z',
    alert: {
      category: 'budget-warning',
      utilizationPercent: 80,
      currentSpendUsd: 8,
      budgetCeilingUsd: 10,
    },
    ...overrides,
  } as NotificationRecord;
}

// --- Tests ---

describe('DocumentNotificationStore', () => {
  let mockStore: IDocumentStore;
  let store: DocumentNotificationStore;

  beforeEach(() => {
    mockStore = createMockDocumentStore();
    store = new DocumentNotificationStore(mockStore);
  });

  describe('save()', () => {
    it('validates via NotificationRecordSchema.parse() and persists to notifications collection', async () => {
      const record = makeToastRecord();
      await store.save(record);

      expect(mockStore.put).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        record.id,
        expect.objectContaining({ id: record.id, kind: 'toast' }),
      );
    });

    it('throws ZodError on invalid record (missing required field)', async () => {
      const invalid = { ...makeToastRecord(), title: '' };
      await expect(store.save(invalid as NotificationRecord)).rejects.toThrow();
    });

    it('throws ZodError on invalid record (wrong kind)', async () => {
      const invalid = { ...makeToastRecord(), kind: 'unknown' };
      await expect(store.save(invalid as NotificationRecord)).rejects.toThrow();
    });
  });

  describe('get()', () => {
    it('returns NotificationRecord for valid stored record', async () => {
      const record = makeHealthRecord();
      vi.mocked(mockStore.get).mockResolvedValue(record);

      const result = await store.get(record.id);
      expect(result).toEqual(expect.objectContaining({ id: record.id, kind: 'health' }));
    });

    it('returns null for missing ID', async () => {
      vi.mocked(mockStore.get).mockResolvedValue(null);

      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for corrupted/invalid stored data (safeParse failure)', async () => {
      vi.mocked(mockStore.get).mockResolvedValue({ garbage: true });

      const result = await store.get('some-id');
      expect(result).toBeNull();
    });
  });

  describe('query()', () => {
    it('maps NotificationFilter fields to DocumentFilter.where correctly', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await store.query({
        projectId: 'proj-1',
        kind: 'toast',
        status: 'active',
        transient: true,
        level: 'info',
      });

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          where: {
            projectId: 'proj-1',
            kind: 'toast',
            status: 'active',
            transient: true,
            level: 'info',
          },
        }),
      );
    });

    it('filters out Zod-invalid records from results', async () => {
      const valid = makeToastRecord();
      vi.mocked(mockStore.query).mockResolvedValue([
        valid,
        { garbage: true },
        valid,
      ]);

      const results = await store.query({});
      expect(results).toHaveLength(2);
    });

    it('applies default limit 50 and offset 0', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await store.query({});

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          limit: 50,
          offset: 0,
        }),
      );
    });

    it('passes custom limit and offset through', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await store.query({ limit: 10, offset: 5 });

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          limit: 10,
          offset: 5,
        }),
      );
    });

    it('returns records ordered by createdAt desc', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await store.query({});

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          orderBy: 'createdAt',
          orderDirection: 'desc',
        }),
      );
    });
  });

  describe('countByStatus()', () => {
    it('counts records by status', async () => {
      const records = [makeToastRecord(), makeHealthRecord()];
      vi.mocked(mockStore.query).mockResolvedValue(records);

      const count = await store.countByStatus('active');
      expect(count).toBe(2);
      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({ where: { status: 'active' } }),
      );
    });

    it('scopes by projectId when provided', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([makeToastRecord()]);

      await store.countByStatus('active', 'proj-1');

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          where: { status: 'active', projectId: 'proj-1' },
        }),
      );
    });
  });

  describe('deleteAll()', () => {
    it('returns 0 when store is empty', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      const deleted = await store.deleteAll();
      expect(deleted).toBe(0);
      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({ where: {}, limit: 1000 }),
      );
    });

    it('deletes all saved notifications and returns correct count', async () => {
      const records = [
        makeToastRecord({ id: '00000000-0000-0000-0000-000000000020' }),
        makeHealthRecord({ id: '00000000-0000-0000-0000-000000000021' }),
        makeAlertRecord({ id: '00000000-0000-0000-0000-000000000022' }),
      ];
      vi.mocked(mockStore.query).mockResolvedValue(records);

      const deleted = await store.deleteAll();
      expect(deleted).toBe(3);
      expect(mockStore.delete).toHaveBeenCalledTimes(3);
      expect(mockStore.delete).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        '00000000-0000-0000-0000-000000000020',
      );
      expect(mockStore.delete).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        '00000000-0000-0000-0000-000000000021',
      );
      expect(mockStore.delete).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        '00000000-0000-0000-0000-000000000022',
      );
    });

    it('only deletes items that pass Zod validation (skips corrupted records)', async () => {
      const valid = makeToastRecord({ id: '00000000-0000-0000-0000-000000000023' });
      vi.mocked(mockStore.query).mockResolvedValue([valid, { garbage: true }]);

      const deleted = await store.deleteAll();
      expect(deleted).toBe(1);
      expect(mockStore.delete).toHaveBeenCalledTimes(1);
      expect(mockStore.delete).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        '00000000-0000-0000-0000-000000000023',
      );
    });
  });

  describe('deleteExpiredTransient()', () => {
    it('deletes only transient+dismissed records older than threshold', async () => {
      const old = makeToastRecord({
        id: '00000000-0000-0000-0000-000000000010',
        status: 'dismissed',
        transient: true,
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      vi.mocked(mockStore.query).mockResolvedValue([old]);

      const deleted = await store.deleteExpiredTransient(3600_000);
      expect(deleted).toBe(1);
      expect(mockStore.delete).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        old.id,
      );
    });

    it('preserves records newer than threshold', async () => {
      const recent = makeToastRecord({
        id: '00000000-0000-0000-0000-000000000011',
        status: 'dismissed',
        transient: true,
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(mockStore.query).mockResolvedValue([recent]);

      const deleted = await store.deleteExpiredTransient(3600_000);
      expect(deleted).toBe(0);
      expect(mockStore.delete).not.toHaveBeenCalled();
    });

    it('queries for transient+dismissed records', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      await store.deleteExpiredTransient(3600_000);

      expect(mockStore.query).toHaveBeenCalledWith(
        NOTIFICATION_COLLECTION,
        expect.objectContaining({
          where: { transient: true, status: 'dismissed' },
        }),
      );
    });

    it('returns 0 when no matching records', async () => {
      vi.mocked(mockStore.query).mockResolvedValue([]);

      const deleted = await store.deleteExpiredTransient(3600_000);
      expect(deleted).toBe(0);
    });
  });
});
