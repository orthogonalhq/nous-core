/**
 * Tasks tRPC router.
 *
 * WR-111 — Lightweight Task System.
 * Provides 8 endpoints for task lifecycle management: list, get, create,
 * update, delete, toggle, trigger, and executions.
 *
 * Tasks are stored in their own 'tasks' collection via ITaskStore,
 * independent of ProjectConfig.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { ProjectIdSchema } from '@nous/shared';
import type { TaskDefinition, TaskExecutionRecord } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

// ── Input schemas defined locally ────────────────────────────────────────────
// Canonical schemas live in @nous/shared/types/task.ts. They are duplicated
// here because the desktop backend (tsx/CJS) intermittently fails to resolve
// new barrel re-exports from @nous/shared. This is safe: the tRPC input
// schemas only validate incoming requests — the stored data uses
// TaskDefinitionSchema from @nous/shared via ITaskStore.

const TriggerConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('heartbeat'),
    cronExpression: z.string().min(1),
    timezone: z.string().default('UTC'),
  }),
  z.object({
    type: z.literal('webhook'),
    pathSegment: z.string().min(1),
    secret: z.string().min(32),
  }),
]);

const TaskCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(''),
  trigger: TriggerConfigSchema,
  orchestratorInstructions: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(false),
});

const TaskUpdateInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  trigger: TriggerConfigSchema.optional(),
  orchestratorInstructions: z.string().min(1).optional(),
  context: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

const TASK_EXECUTIONS_COLLECTION = 'task_executions';

/** Check name uniqueness within project tasks. */
function assertNameUnique(
  tasks: TaskDefinition[],
  name: string,
  excludeTaskId?: string,
): void {
  const conflict = tasks.find(
    (t) => t.name === name && t.id !== excludeTaskId,
  );
  if (conflict) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `task_name_conflict: a task named "${name}" already exists in this project`,
    });
  }
}

export const tasksRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }): Promise<TaskDefinition[]> => {
      return ctx.taskStore.listByProject(input.projectId);
    }),

  get: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<TaskDefinition> => {
      const task = await ctx.taskStore.get(input.projectId, input.taskId);
      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Task ${input.taskId} not found in project ${input.projectId}`,
        });
      }
      return task;
    }),

  create: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, task: TaskCreateInputSchema }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      // Verify project exists
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      // Check name uniqueness
      const existingTasks = await ctx.taskStore.listByProject(input.projectId);
      assertNameUnique(existingTasks, input.task.name);

      const now = new Date().toISOString();
      const newTask: TaskDefinition = {
        id: randomUUID(),
        name: input.task.name,
        description: input.task.description ?? '',
        trigger: input.task.trigger,
        orchestratorInstructions: input.task.orchestratorInstructions,
        context: input.task.context,
        enabled: input.task.enabled ?? false,
        createdAt: now,
        updatedAt: now,
      };

      return ctx.taskStore.save(input.projectId, newTask);
    }),

  update: publicProcedure
    .input(z.object({
      projectId: ProjectIdSchema,
      taskId: z.string().uuid(),
      updates: TaskUpdateInputSchema,
    }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      const task = await ctx.taskStore.get(input.projectId, input.taskId);
      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Task ${input.taskId} not found in project ${input.projectId}`,
        });
      }

      if (input.updates.name != null && input.updates.name !== task.name) {
        const existingTasks = await ctx.taskStore.listByProject(input.projectId);
        assertNameUnique(existingTasks, input.updates.name, input.taskId);
      }

      const now = new Date().toISOString();
      const updatedTask: TaskDefinition = {
        ...task,
        ...input.updates,
        id: task.id,
        createdAt: task.createdAt,
        updatedAt: now,
      };

      return ctx.taskStore.save(input.projectId, updatedTask);
    }),

  delete: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ deleted: boolean }> => {
      const deleted = await ctx.taskStore.delete(input.projectId, input.taskId);
      return { deleted };
    }),

  toggle: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      const task = await ctx.taskStore.get(input.projectId, input.taskId);
      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Task ${input.taskId} not found in project ${input.projectId}`,
        });
      }

      const now = new Date().toISOString();
      const toggledTask: TaskDefinition = {
        ...task,
        enabled: !task.enabled,
        updatedAt: now,
      };

      return ctx.taskStore.save(input.projectId, toggledTask);
    }),

  trigger: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ executionId: string; runId: string }> => {
      const task = await ctx.taskStore.get(input.projectId, input.taskId);
      if (!task) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Task ${input.taskId} not found in project ${input.projectId}`,
        });
      }

      if (!task.enabled) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Task ${input.taskId} is disabled and cannot be triggered`,
        });
      }

      const executionId = randomUUID();
      const now = new Date().toISOString();

      const executionRecord: TaskExecutionRecord = {
        id: executionId,
        taskDefinitionId: task.id,
        projectId: input.projectId,
        triggeredAt: now,
        triggerType: 'manual',
        status: 'running',
      };

      await ctx.documentStore.put(
        TASK_EXECUTIONS_COLLECTION,
        executionId,
        executionRecord,
      );

      const receipt = await ctx.gatewayRuntime.submitTaskToSystem({
        task: task.orchestratorInstructions,
        projectId: input.projectId,
        detail: {
          taskDefinitionId: task.id,
          taskName: task.name,
          triggerType: 'manual',
          executionId,
          ...(task.context ?? {}),
        },
      });

      return { executionId, runId: receipt.runId };
    }),

  executions: publicProcedure
    .input(z.object({
      projectId: ProjectIdSchema,
      taskId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }): Promise<TaskExecutionRecord[]> => {
      const filtered = await ctx.documentStore.query<TaskExecutionRecord>(
        TASK_EXECUTIONS_COLLECTION,
        { where: { taskDefinitionId: input.taskId, projectId: input.projectId } },
      );

      return filtered
        .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
        .slice(0, input.limit);
    }),
});
