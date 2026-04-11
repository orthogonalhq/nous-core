import { describe, expect, it, vi } from 'vitest';
import { createCapabilityHandlers } from '../../internal-mcp/index.js';
import type { InternalMcpHandlerContext } from '../../internal-mcp/types.js';
import type {
  ITaskStore,
  IDocumentStore,
  TaskDefinition,
  ProjectId,
} from '@nous/shared';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440001' as ProjectId;
const TASK_ID = '550e8400-e29b-41d4-a716-446655440002';
const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440003';
const RUN_ID = 'run-001';
const NOW = '2026-04-09T12:00:00.000Z';

function makeTask(overrides?: Partial<TaskDefinition>): TaskDefinition {
  return {
    id: TASK_ID,
    name: 'Test Task',
    description: 'A test task',
    trigger: { type: 'manual' },
    orchestratorInstructions: 'Do the thing',
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createMockTaskStore(overrides?: Partial<ITaskStore>): ITaskStore {
  return {
    save: vi.fn().mockImplementation((_pid: ProjectId, task: TaskDefinition) =>
      Promise.resolve(task),
    ),
    get: vi.fn().mockResolvedValue(makeTask()),
    listByProject: vi.fn().mockResolvedValue([makeTask()]),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createMockDocumentStore(overrides?: Partial<IDocumentStore>): IDocumentStore {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    query: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createContext(deps?: Partial<InternalMcpHandlerContext['deps']>): InternalMcpHandlerContext {
  return {
    agentClass: 'Cortex::System',
    agentId: 'test-agent',
    deps: {
      workmodeAdmissionGuard: {
        evaluate: vi.fn().mockResolvedValue({ admitted: true, workmodeId: 'default' }),
      },
      now: () => NOW,
      nowMs: () => Date.parse(NOW),
      idFactory: () => EXECUTION_ID,
      ...deps,
    },
  };
}

const execution = { projectId: PROJECT_ID, traceId: 'trace-1' };

describe('Task handler unit tests', () => {
  describe('task_list', () => {
    it('delegates to taskStore.listByProject and returns tasks', async () => {
      const taskStore = createMockTaskStore();
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_list({}, execution);
      expect(result.success).toBe(true);
      expect((result.output as { tasks: TaskDefinition[] }).tasks).toHaveLength(1);
      expect(taskStore.listByProject).toHaveBeenCalledWith(PROJECT_ID);
    });
  });

  describe('task_get', () => {
    it('returns task when found', async () => {
      const taskStore = createMockTaskStore();
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_get(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      );
      expect(result.success).toBe(true);
      expect((result.output as { task: TaskDefinition }).task.id).toBe(TASK_ID);
    });

    it('throws NOT_FOUND when task is null', async () => {
      const taskStore = createMockTaskStore({ get: vi.fn().mockResolvedValue(null) });
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      await expect(
        handlers.task_get({ projectId: PROJECT_ID, taskId: TASK_ID }, execution),
      ).rejects.toThrow('not found');
    });
  });

  describe('task_create', () => {
    it('delegates to taskStore.save and returns task', async () => {
      const taskStore = createMockTaskStore();
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_create(
        {
          projectId: PROJECT_ID,
          task: {
            name: 'New Task',
            trigger: { type: 'manual' },
            orchestratorInstructions: 'Do it',
          },
        },
        execution,
      );
      expect(result.success).toBe(true);
      expect(taskStore.save).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ name: 'New Task' }),
      );
    });
  });

  describe('task_update', () => {
    it('merges updates and saves', async () => {
      const taskStore = createMockTaskStore();
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_update(
        {
          projectId: PROJECT_ID,
          taskId: TASK_ID,
          updates: { name: 'Updated Name' },
        },
        execution,
      );
      expect(result.success).toBe(true);
      expect(taskStore.save).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ name: 'Updated Name', updatedAt: NOW }),
      );
    });

    it('throws NOT_FOUND for non-existent task', async () => {
      const taskStore = createMockTaskStore({ get: vi.fn().mockResolvedValue(null) });
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      await expect(
        handlers.task_update(
          { projectId: PROJECT_ID, taskId: TASK_ID, updates: { name: 'X' } },
          execution,
        ),
      ).rejects.toThrow('not found');
    });
  });

  describe('task_delete', () => {
    it('delegates to taskStore.delete', async () => {
      const taskStore = createMockTaskStore();
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_delete(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      );
      expect(result.success).toBe(true);
      expect((result.output as { deleted: boolean }).deleted).toBe(true);
      expect(taskStore.delete).toHaveBeenCalledWith(PROJECT_ID, TASK_ID);
    });
  });

  describe('task_toggle', () => {
    it('toggles enabled field and saves', async () => {
      const taskStore = createMockTaskStore({
        get: vi.fn().mockResolvedValue(makeTask({ enabled: true })),
      });
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      const result = await handlers.task_toggle(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      );
      expect(result.success).toBe(true);
      expect(taskStore.save).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ enabled: false }),
      );
    });

    it('throws NOT_FOUND for non-existent task', async () => {
      const taskStore = createMockTaskStore({ get: vi.fn().mockResolvedValue(null) });
      const handlers = createCapabilityHandlers(createContext({ taskStore }));
      await expect(
        handlers.task_toggle(
          { projectId: PROJECT_ID, taskId: TASK_ID },
          execution,
        ),
      ).rejects.toThrow('not found');
    });
  });

  describe('task_trigger', () => {
    it('writes execution record and calls submitTaskToSystem', async () => {
      const taskStore = createMockTaskStore();
      const documentStore = createMockDocumentStore();
      const submitTaskToSystem = vi.fn().mockResolvedValue({
        runId: RUN_ID,
        dispatchRef: 'dispatch-1',
        acceptedAt: NOW,
      });
      const handlers = createCapabilityHandlers(
        createContext({ taskStore, documentStore, submitTaskToSystem }),
      );
      const result = await handlers.task_trigger(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      );
      expect(result.success).toBe(true);
      const output = result.output as { executionId: string; runId: string };
      expect(output.executionId).toBe(EXECUTION_ID);
      expect(output.runId).toBe(RUN_ID);
      expect(documentStore.put).toHaveBeenCalledWith(
        'task_executions',
        EXECUTION_ID,
        expect.objectContaining({
          id: EXECUTION_ID,
          taskDefinitionId: TASK_ID,
          status: 'running',
        }),
      );
      expect(submitTaskToSystem).toHaveBeenCalled();
    });

    it('throws when task is disabled', async () => {
      const taskStore = createMockTaskStore({
        get: vi.fn().mockResolvedValue(makeTask({ enabled: false })),
      });
      const documentStore = createMockDocumentStore();
      const submitTaskToSystem = vi.fn();
      const handlers = createCapabilityHandlers(
        createContext({ taskStore, documentStore, submitTaskToSystem }),
      );
      await expect(
        handlers.task_trigger(
          { projectId: PROJECT_ID, taskId: TASK_ID },
          execution,
        ),
      ).rejects.toThrow('disabled');
    });
  });

  describe('task_history', () => {
    it('queries task_executions collection', async () => {
      const documentStore = createMockDocumentStore({
        query: vi.fn().mockResolvedValue([
          {
            id: EXECUTION_ID,
            taskDefinitionId: TASK_ID,
            projectId: PROJECT_ID,
            triggeredAt: NOW,
            triggerType: 'manual',
            status: 'completed',
          },
        ]),
      });
      const handlers = createCapabilityHandlers(
        createContext({ documentStore }),
      );
      const result = await handlers.task_history(
        { projectId: PROJECT_ID, taskId: TASK_ID, limit: 10 },
        execution,
      );
      expect(result.success).toBe(true);
      expect(documentStore.query).toHaveBeenCalledWith(
        'task_executions',
        expect.objectContaining({
          where: { taskDefinitionId: TASK_ID, projectId: PROJECT_ID },
        }),
      );
    });
  });

  describe('workflow_history', () => {
    it('returns empty executions array (V1 stub)', async () => {
      const handlers = createCapabilityHandlers(createContext());
      const result = await handlers.workflow_history({}, execution);
      expect(result.success).toBe(true);
      expect((result.output as { executions: unknown[] }).executions).toEqual([]);
    });
  });
});

describe('Task handler edge cases', () => {
  it('all task handlers throw SERVICE_UNAVAILABLE when taskStore is missing', async () => {
    const handlers = createCapabilityHandlers(createContext());
    const toolsNeedingTaskStore = [
      'task_list', 'task_get', 'task_create', 'task_update',
      'task_delete', 'task_toggle', 'task_trigger',
    ] as const;

    for (const toolName of toolsNeedingTaskStore) {
      await expect(
        handlers[toolName](
          { projectId: PROJECT_ID, taskId: TASK_ID },
          execution,
        ),
      ).rejects.toThrow('unavailable');
    }
  });

  it('task_history throws SERVICE_UNAVAILABLE when documentStore is missing', async () => {
    const handlers = createCapabilityHandlers(createContext());
    await expect(
      handlers.task_history(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('task_trigger throws SERVICE_UNAVAILABLE when documentStore is missing', async () => {
    const taskStore = createMockTaskStore();
    const handlers = createCapabilityHandlers(createContext({ taskStore }));
    await expect(
      handlers.task_trigger(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('task_trigger throws SERVICE_UNAVAILABLE when submitTaskToSystem is missing', async () => {
    const taskStore = createMockTaskStore();
    const documentStore = createMockDocumentStore();
    const handlers = createCapabilityHandlers(
      createContext({ taskStore, documentStore }),
    );
    await expect(
      handlers.task_trigger(
        { projectId: PROJECT_ID, taskId: TASK_ID },
        execution,
      ),
    ).rejects.toThrow('unavailable');
  });

  it('all handlers throw PROJECT_SCOPE_REQUIRED when projectId is absent', async () => {
    const taskStore = createMockTaskStore();
    const documentStore = createMockDocumentStore();
    const submitTaskToSystem = vi.fn();
    const handlers = createCapabilityHandlers(
      createContext({ taskStore, documentStore, submitTaskToSystem }),
    );
    const noProjectExecution = { traceId: 'trace-1' };
    const toolNames = [
      'task_list', 'task_get', 'task_create', 'task_update',
      'task_delete', 'task_toggle', 'task_trigger', 'task_history',
    ] as const;

    for (const toolName of toolNames) {
      await expect(
        handlers[toolName](
          { projectId: PROJECT_ID, taskId: TASK_ID },
          noProjectExecution as never,
        ),
      ).rejects.toThrow('projectId');
    }
  });
});
