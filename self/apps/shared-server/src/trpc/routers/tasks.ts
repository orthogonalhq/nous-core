/**
 * Tasks tRPC router.
 *
 * WR-111 — Lightweight Task System.
 * Provides 8 endpoints for task lifecycle management: list, get, create,
 * update, delete, toggle, trigger, and executions.
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { ProjectIdSchema } from '@nous/shared';
import type { TaskDefinition, TaskExecutionRecord, ProjectConfig } from '@nous/shared';
import { router, publicProcedure } from '../trpc';

// ── Input schemas defined locally ────────────────────────────────────────────
// Canonical schemas live in @nous/shared/types/task.ts. They are duplicated
// here because the desktop backend (tsx/CJS) intermittently fails to resolve
// new barrel re-exports from @nous/shared. This is safe: the tRPC input
// schemas only validate incoming requests — the stored data uses
// TaskDefinitionSchema from @nous/shared via ProjectConfigSchema.

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

/** Find task in project or throw NOT_FOUND. */
function getTaskOrThrow(project: ProjectConfig, taskId: string): TaskDefinition {
  const task = (project.tasks ?? []).find((t) => t.id === taskId);
  if (!task) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Task ${taskId} not found in project ${project.id}`,
    });
  }
  return task;
}

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
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }
      return project.tasks ?? [];
    }),

  get: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<TaskDefinition> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }
      return getTaskOrThrow(project, input.taskId);
    }),

  create: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, task: TaskCreateInputSchema }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      const existingTasks = project.tasks ?? [];
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

      await ctx.projectStore.update(input.projectId, {
        tasks: [...existingTasks, newTask],
      });

      return newTask;
    }),

  update: publicProcedure
    .input(z.object({
      projectId: ProjectIdSchema,
      taskId: z.string().uuid(),
      updates: TaskUpdateInputSchema,
    }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      const existingTasks = project.tasks ?? [];
      const task = getTaskOrThrow(project, input.taskId);

      if (input.updates.name != null && input.updates.name !== task.name) {
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

      const updatedTasks = existingTasks.map((t) =>
        t.id === input.taskId ? updatedTask : t,
      );

      await ctx.projectStore.update(input.projectId, {
        tasks: updatedTasks,
      });

      return updatedTask;
    }),

  delete: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ deleted: boolean }> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      const existingTasks = project.tasks ?? [];
      const filtered = existingTasks.filter((t) => t.id !== input.taskId);

      await ctx.projectStore.update(input.projectId, {
        tasks: filtered,
      });

      return { deleted: filtered.length < existingTasks.length };
    }),

  toggle: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<TaskDefinition> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      const existingTasks = project.tasks ?? [];
      const task = getTaskOrThrow(project, input.taskId);

      const now = new Date().toISOString();
      const toggledTask: TaskDefinition = {
        ...task,
        enabled: !task.enabled,
        updatedAt: now,
      };

      const updatedTasks = existingTasks.map((t) =>
        t.id === input.taskId ? toggledTask : t,
      );

      await ctx.projectStore.update(input.projectId, {
        tasks: updatedTasks,
      });

      return toggledTask;
    }),

  trigger: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema, taskId: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ executionId: string; runId: string }> => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Project ${input.projectId} not found`,
        });
      }

      const task = getTaskOrThrow(project, input.taskId);

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
