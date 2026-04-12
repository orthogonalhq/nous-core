import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  INotificationService,
  IScopedMcpToolSurface,
  NotificationRecord,
} from '@nous/shared';
import {
  createDevNotificationToolSurface,
  SEED_TEST_NOTIFICATIONS_TOOL_NAME,
  CLEAR_ALL_NOTIFICATIONS_TOOL_NAME,
} from '../../gateway-runtime/index.js';
import type { DocumentNotificationStore } from '@nous/subcortex-notification';

// --- Helpers ---

function createMockNotificationService(): INotificationService {
  let callCount = 0;
  return {
    raise: vi.fn().mockImplementation((input) => {
      callCount++;
      return Promise.resolve({
        id: `00000000-0000-0000-0000-${String(callCount).padStart(12, '0')}`,
        ...input,
        level: 'info',
        status: 'active',
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:00.000Z',
      } as NotificationRecord);
    }),
    acknowledge: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({
        id,
        kind: 'toast',
        projectId: null,
        level: 'info',
        title: 'test',
        message: 'test',
        status: 'acknowledged',
        transient: false,
        source: 'test',
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:01.000Z',
      } as unknown as NotificationRecord),
    ),
    dismiss: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({
        id,
        kind: 'toast',
        projectId: null,
        level: 'info',
        title: 'test',
        message: 'test',
        status: 'dismissed',
        transient: false,
        source: 'test',
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:01.000Z',
      } as unknown as NotificationRecord),
    ),
    get: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({
        id,
        kind: 'toast',
        projectId: null,
        level: 'info',
        title: 'test',
        message: 'test',
        status: 'active',
        transient: false,
        source: 'test',
        createdAt: '2026-04-10T12:00:00.000Z',
        updatedAt: '2026-04-10T12:00:00.000Z',
        toast: { severity: 'info', dismissible: true, durationMs: 8000 },
      } as unknown as NotificationRecord),
    ),
    list: vi.fn().mockResolvedValue([]),
    countActive: vi.fn().mockResolvedValue(0),
  } as unknown as INotificationService;
}

function createMockNotificationStore(): DocumentNotificationStore {
  return {
    deleteAll: vi.fn().mockResolvedValue(0),
  } as unknown as DocumentNotificationStore;
}

function createMockBaseToolSurface(): IScopedMcpToolSurface {
  return {
    listTools: vi.fn().mockResolvedValue([
      {
        name: 'existing_tool',
        version: '1.0.0',
        description: 'An existing tool',
        inputSchema: {},
        outputSchema: {},
        capabilities: [],
        permissionScope: 'project',
      },
    ]),
    executeTool: vi.fn().mockResolvedValue({
      success: true,
      output: 'base result',
      durationMs: 0,
    }),
  };
}

// --- Tests ---

describe('dev notification tools', () => {
  let mockService: INotificationService;
  let mockStore: DocumentNotificationStore;
  let mockBase: IScopedMcpToolSurface;

  beforeEach(() => {
    mockService = createMockNotificationService();
    mockStore = createMockNotificationStore();
    mockBase = createMockBaseToolSurface();
  });

  describe('createDevNotificationToolSurface', () => {
    it('returns an IScopedMcpToolSurface', () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      expect(surface).toBeDefined();
      expect(surface.listTools).toBeTypeOf('function');
      expect(surface.executeTool).toBeTypeOf('function');
    });

    it('listTools() includes seed and clear tools alongside base tools', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const tools = await surface.listTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain('existing_tool');
      expect(names).toContain(SEED_TEST_NOTIFICATIONS_TOOL_NAME);
      expect(names).toContain(CLEAR_ALL_NOTIFICATIONS_TOOL_NAME);
      expect(tools.length).toBe(3);
    });

    it('executeTool delegates unknown tool names to base surface', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const result = await surface.executeTool('existing_tool', { arg: 1 });

      expect(mockBase.executeTool).toHaveBeenCalledWith(
        'existing_tool',
        { arg: 1 },
        undefined,
      );
      expect(result.success).toBe(true);
      expect(result.output).toBe('base result');
    });
  });

  describe('seed_test_notifications', () => {
    it('calls notificationService.raise() for all 5 kinds', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      await surface.executeTool(SEED_TEST_NOTIFICATIONS_TOOL_NAME, {});

      const raiseCalls = vi.mocked(mockService.raise).mock.calls;
      const kinds = raiseCalls.map((call) => call[0].kind);

      expect(kinds).toContain('escalation');
      expect(kinds).toContain('alert');
      expect(kinds).toContain('health');
      expect(kinds).toContain('panel');
      expect(kinds).toContain('toast');
    });

    it('calls acknowledge() and dismiss() to produce all 3 lifecycle states', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      await surface.executeTool(SEED_TEST_NOTIFICATIONS_TOOL_NAME, {});

      expect(vi.mocked(mockService.acknowledge)).toHaveBeenCalled();
      expect(vi.mocked(mockService.dismiss)).toHaveBeenCalled();
    });

    it('returns structured summary with seeded, byKind, byLevel, byStatus fields', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const result = await surface.executeTool(SEED_TEST_NOTIFICATIONS_TOOL_NAME, {});

      expect(result.success).toBe(true);
      const output = result.output as {
        seeded: number;
        byKind: Record<string, number>;
        byLevel: Record<string, number>;
        byStatus: Record<string, number>;
      };
      expect(output.seeded).toBeGreaterThanOrEqual(10);
      expect(output.byKind).toBeDefined();
      expect(output.byLevel).toBeDefined();
      expect(output.byStatus).toBeDefined();
    });

    it('each seed notification has a unique title to avoid dedup', async () => {
      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      await surface.executeTool(SEED_TEST_NOTIFICATIONS_TOOL_NAME, {});

      const raiseCalls = vi.mocked(mockService.raise).mock.calls;
      const titles = raiseCalls.map((call) => call[0].title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(titles.length);
    });

    it('returns error result if raise() throws', async () => {
      vi.mocked(mockService.raise).mockRejectedValue(
        new Error('Zod validation failed'),
      );

      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const result = await surface.executeTool(SEED_TEST_NOTIFICATIONS_TOOL_NAME, {});

      expect(result.success).toBe(false);
      expect((result.output as { error: string }).error).toContain(
        'Zod validation failed',
      );
    });
  });

  describe('clear_all_notifications', () => {
    it('calls notificationStore.deleteAll() and returns deleted count', async () => {
      vi.mocked(mockStore.deleteAll).mockResolvedValue(5);

      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const result = await surface.executeTool(CLEAR_ALL_NOTIFICATIONS_TOOL_NAME, {});

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ deleted: 5 });
      expect(mockStore.deleteAll).toHaveBeenCalledOnce();
    });

    it('returns { deleted: 0 } when store is empty', async () => {
      vi.mocked(mockStore.deleteAll).mockResolvedValue(0);

      const surface = createDevNotificationToolSurface({
        baseToolSurface: mockBase,
        notificationService: mockService,
        notificationStore: mockStore,
      });

      const result = await surface.executeTool(CLEAR_ALL_NOTIFICATIONS_TOOL_NAME, {});

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ deleted: 0 });
    });
  });
});
