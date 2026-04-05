/**
 * Tasks tRPC router tests.
 *
 * WR-111 — Lightweight Task System.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies to avoid worktree resolution issues
vi.mock('@nous/cortex-core', async () => {
  const { z } = await import('zod');
  return {
    BacklogEntryStatusSchema: z.enum(['queued', 'active', 'suspended', 'completed', 'failed']),
  };
});
vi.mock('@nous/cortex-pfc', () => ({}));
vi.mock('@nous/subcortex-apps', () => ({}));
vi.mock('@nous/subcortex-artifacts', () => ({}));
vi.mock('@nous/subcortex-coding-agents', () => ({}));
vi.mock('@nous/subcortex-communication-gateway', () => ({}));
vi.mock('@nous/subcortex-endpoint-trust', () => ({}));
vi.mock('@nous/subcortex-escalation', () => ({}));
vi.mock('@nous/subcortex-gtm', () => ({}));
vi.mock('@nous/subcortex-mao', () => ({}));
vi.mock('@nous/subcortex-nudges', () => ({}));
vi.mock('@nous/subcortex-opctl', () => ({}));
vi.mock('@nous/subcortex-projects', () => ({}));
vi.mock('@nous/subcortex-providers', () => ({}));
vi.mock('@nous/subcortex-public-mcp', () => ({}));
vi.mock('@nous/subcortex-registry', () => ({}));
vi.mock('@nous/subcortex-router', () => ({}));
vi.mock('@nous/subcortex-scheduler', () => ({}));
vi.mock('@nous/subcortex-tools', () => ({}));
vi.mock('@nous/subcortex-voice-control', () => ({}));
vi.mock('@nous/subcortex-witnessd', () => ({}));
vi.mock('@nous/subcortex-workflows', () => ({}));
vi.mock('@nous/memory-access', () => ({}));
vi.mock('@nous/memory-knowledge-index', () => ({}));
vi.mock('@nous/memory-mwc', () => ({}));
vi.mock('@nous/memory-stm', () => ({}));
vi.mock('@nous/memory-distillation', () => ({}));
vi.mock('@nous/autonomic-config', () => ({}));
vi.mock('@nous/autonomic-credentials', () => ({}));
vi.mock('@nous/autonomic-embeddings', () => ({}));
vi.mock('@nous/autonomic-health', () => ({}));
vi.mock('@nous/autonomic-runtime', () => ({}));
vi.mock('@nous/autonomic-storage', () => ({}));

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440600';
const TASK_ID = '550e8400-e29b-41d4-a716-446655440601';

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    name: 'Test Task',
    description: 'A test task',
    trigger: { type: 'manual' as const },
    orchestratorInstructions: 'Execute this test task',
    enabled: true,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    ...overrides,
  };
}

function createMockContext(tasks: Record<string, unknown>[] = []) {
  // In-memory task storage keyed by taskId
  const taskMap = new Map<string, Record<string, unknown>>();
  for (const t of tasks) {
    taskMap.set(t.id as string, { ...t, projectId: PROJECT_ID });
  }

  return {
    projectStore: {
      get: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        name: 'Test Project',
        type: 'hybrid',
      }),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      list: vi.fn(),
      archive: vi.fn(),
    },
    taskStore: {
      save: vi.fn().mockImplementation(async (_projectId: string, task: Record<string, unknown>) => {
        taskMap.set(task.id as string, { ...task, projectId: _projectId });
        return task;
      }),
      get: vi.fn().mockImplementation(async (projectId: string, taskId: string) => {
        const task = taskMap.get(taskId);
        if (!task || task.projectId !== projectId) return null;
        const { projectId: _pid, ...rest } = task;
        return rest;
      }),
      listByProject: vi.fn().mockImplementation(async (projectId: string) => {
        return [...taskMap.values()]
          .filter((t) => t.projectId === projectId)
          .map(({ projectId: _pid, ...rest }) => rest);
      }),
      delete: vi.fn().mockImplementation(async (_projectId: string, taskId: string) => {
        return taskMap.delete(taskId);
      }),
    },
    documentStore: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      query: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    },
    gatewayRuntime: {
      submitTaskToSystem: vi.fn().mockResolvedValue({
        runId: 'run-task-001',
        dispatchRef: 'dispatch:task-001',
        acceptedAt: '2026-04-02T00:00:00Z',
        source: 'task-trigger',
      }),
    },
  } as any;
}

async function getCaller(ctx: any) {
  const { tasksRouter } = await import('../src/trpc/routers/tasks.js');
  const { router: createRouter } = await import('../src/trpc/trpc.js');
  const testRouter = createRouter({ tasks: tasksRouter });
  return testRouter.createCaller(ctx);
}

describe('tasks.list', () => {
  it('returns empty array for project with no tasks', async () => {
    const ctx = createMockContext([]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.list({ projectId: PROJECT_ID });
    expect(result).toEqual([]);
  });

  it('returns task definitions for project with tasks', async () => {
    const task = createTask();
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.list({ projectId: PROJECT_ID });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Test Task');
  });
});

describe('tasks.get', () => {
  it('returns specific task definition', async () => {
    const task = createTask();
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.get({ projectId: PROJECT_ID, taskId: TASK_ID });
    expect(result.id).toBe(TASK_ID);
    expect(result.name).toBe('Test Task');
  });

  it('throws NOT_FOUND for non-existent task', async () => {
    const ctx = createMockContext([]);
    const caller = await getCaller(ctx);

    await expect(
      caller.tasks.get({
        projectId: PROJECT_ID,
        taskId: '550e8400-e29b-41d4-a716-446655440999',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('tasks.create', () => {
  it('creates a new task and returns it', async () => {
    const ctx = createMockContext([]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.create({
      projectId: PROJECT_ID,
      task: {
        name: 'New Task',
        trigger: { type: 'manual' },
        orchestratorInstructions: 'Do something new',
      },
    });

    expect(result.name).toBe('New Task');
    expect(result.enabled).toBe(false); // default
    expect(result.description).toBe(''); // default
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();

    // Verify taskStore.save was called
    expect(ctx.taskStore.save).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ name: 'New Task' }),
    );
  });

  it('rejects duplicate task name', async () => {
    const existingTask = createTask({ name: 'Existing Task' });
    const ctx = createMockContext([existingTask]);
    const caller = await getCaller(ctx);

    await expect(
      caller.tasks.create({
        projectId: PROJECT_ID,
        task: {
          name: 'Existing Task',
          trigger: { type: 'manual' },
          orchestratorInstructions: 'Duplicate',
        },
      }),
    ).rejects.toThrow(/task_name_conflict/);
  });
});

describe('tasks.update', () => {
  it('updates an existing task', async () => {
    const task = createTask();
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.update({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      updates: { name: 'Updated Name' },
    });

    expect(result.name).toBe('Updated Name');
    expect(result.id).toBe(TASK_ID);
    expect(ctx.taskStore.save).toHaveBeenCalled();
  });

  it('enforces name uniqueness on update', async () => {
    const task1 = createTask({ id: TASK_ID, name: 'Task A' });
    const task2 = createTask({
      id: '550e8400-e29b-41d4-a716-446655440602',
      name: 'Task B',
    });
    const ctx = createMockContext([task1, task2]);
    const caller = await getCaller(ctx);

    await expect(
      caller.tasks.update({
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        updates: { name: 'Task B' },
      }),
    ).rejects.toThrow(/task_name_conflict/);
  });

  it('updates updatedAt timestamp', async () => {
    const task = createTask({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.update({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      updates: { description: 'new desc' },
    });

    expect(result.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('tasks.delete', () => {
  it('deletes an existing task', async () => {
    const task = createTask();
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.delete({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    });

    expect(result.deleted).toBe(true);
    expect(ctx.taskStore.delete).toHaveBeenCalledWith(PROJECT_ID, TASK_ID);
  });

  it('returns deleted: false for non-existent task', async () => {
    const ctx = createMockContext([]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.delete({
      projectId: PROJECT_ID,
      taskId: '550e8400-e29b-41d4-a716-446655440999',
    });

    expect(result.deleted).toBe(false);
  });
});

describe('tasks.toggle', () => {
  it('flips enabled from true to false', async () => {
    const task = createTask({ enabled: true });
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.toggle({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    });

    expect(result.enabled).toBe(false);
  });

  it('flips enabled from false to true', async () => {
    const task = createTask({ enabled: false });
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.toggle({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    });

    expect(result.enabled).toBe(true);
  });
});

describe('tasks.trigger', () => {
  it('dispatches enabled task and creates execution record', async () => {
    const task = createTask({ enabled: true });
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    const result = await caller.tasks.trigger({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
    });

    expect(result.executionId).toBeDefined();
    expect(result.runId).toBe('run-task-001');

    // Verify execution record was written
    expect(ctx.documentStore.put).toHaveBeenCalledWith(
      'task_executions',
      expect.any(String),
      expect.objectContaining({
        taskDefinitionId: TASK_ID,
        projectId: PROJECT_ID,
        triggerType: 'manual',
        status: 'running',
      }),
    );

    // Verify gateway was called
    expect(ctx.gatewayRuntime.submitTaskToSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'Execute this test task',
        projectId: PROJECT_ID,
      }),
    );
  });

  it('rejects disabled task with FORBIDDEN', async () => {
    const task = createTask({ enabled: false });
    const ctx = createMockContext([task]);
    const caller = await getCaller(ctx);

    await expect(
      caller.tasks.trigger({ projectId: PROJECT_ID, taskId: TASK_ID }),
    ).rejects.toThrow(/disabled/i);
  });

  it('throws NOT_FOUND for non-existent task', async () => {
    const ctx = createMockContext([]);
    const caller = await getCaller(ctx);

    await expect(
      caller.tasks.trigger({
        projectId: PROJECT_ID,
        taskId: '550e8400-e29b-41d4-a716-446655440999',
      }),
    ).rejects.toThrow(/not found/i);
  });
});
