/**
 * Projects tRPC router.
 */
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type {
  ExecutionTrace,
  ProjectConfig,
  ProjectId,
  WorkflowDefinition,
  WorkflowEditorValidationIssue,
  WorkflowNodeProjectionStatus,
  WorkflowRunState,
} from '@nous/shared';
import {
  ExecutionTraceSchema,
  ProjectIdSchema,
  ProjectWorkflowSurfaceSnapshotSchema,
  SaveWorkflowDefinitionInputSchema,
  WorkflowDefinitionSchema,
  WorkflowDefinitionValidationResultSchema,
  WorkflowExecutionIdSchema,
} from '@nous/shared';
import {
  buildDerivedWorkflowGraph,
  validateWorkflowDefinition as validateWorkflowDefinitionShape,
} from '@nous/subcortex-workflows';
import { router, publicProcedure } from '../trpc';

const TRACE_COLLECTION = 'execution_traces';

const projectUpdateInputSchema = z.object({
  id: ProjectIdSchema,
  updates: z.object({
    name: z.string().min(1).optional(),
    pfcTier: z.number().min(0).max(5).optional(),
    modelAssignments: z.record(z.string(), z.string()).optional(),
  }).partial(),
});

function getProjectIdentity(project: ProjectConfig) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
  };
}

function getWorkflowDefinitions(project: ProjectConfig): WorkflowDefinition[] {
  return project.workflow?.definitions ?? [];
}

function selectWorkflowDefinition(
  project: ProjectConfig,
  preferredDefinitionId?: WorkflowDefinition['id'],
): WorkflowDefinition | null {
  const definitions = getWorkflowDefinitions(project);
  if (definitions.length === 0) {
    return null;
  }

  if (preferredDefinitionId) {
    const preferred = definitions.find((definition) => definition.id === preferredDefinitionId);
    if (preferred) {
      return preferred;
    }
  }

  if (project.workflow?.defaultWorkflowDefinitionId) {
    const configuredDefault = definitions.find(
      (definition) => definition.id === project.workflow?.defaultWorkflowDefinitionId,
    );
    if (configuredDefault) {
      return configuredDefault;
    }
  }

  return definitions[0] ?? null;
}

function activeRunStatus(run: WorkflowRunState): boolean {
  return ['ready', 'running', 'waiting', 'blocked_review', 'paused'].includes(
    run.status,
  );
}

function buildIssue(
  severity: WorkflowEditorValidationIssue['severity'],
  code: string,
  message: string,
  path: string[] = [],
): WorkflowEditorValidationIssue {
  return { severity, code, message, path };
}

function validateDraftDefinition(
  projectId: ProjectId,
  workflowDefinition: unknown,
) {
  const parsedDefinition = WorkflowDefinitionSchema.safeParse(workflowDefinition);
  if (!parsedDefinition.success) {
    return WorkflowDefinitionValidationResultSchema.parse({
      valid: false,
      definition: null,
      derivedGraph: null,
      issues: parsedDefinition.error.issues.map((issue) =>
        buildIssue(
          'error',
          'workflow_definition_schema_invalid',
          issue.message,
          issue.path.map((segment) => String(segment)),
        )),
    });
  }

  const definition = parsedDefinition.data;
  const issues: WorkflowEditorValidationIssue[] = [];
  if (definition.projectId !== projectId) {
    issues.push(
      buildIssue(
        'error',
        'workflow_definition_project_mismatch',
        `Workflow definition projectId (${definition.projectId}) must match the selected project (${projectId})`,
        ['projectId'],
      ),
    );
  }

  const validation = validateWorkflowDefinitionShape(definition);
  if (!validation.valid) {
    issues.push(
      ...validation.issues.map((issue) =>
        buildIssue('error', issue.code, issue.message)),
    );
  }

  if (issues.length > 0) {
    return WorkflowDefinitionValidationResultSchema.parse({
      valid: false,
      definition,
      derivedGraph: null,
      issues,
    });
  }

  return WorkflowDefinitionValidationResultSchema.parse({
    valid: true,
    definition,
    derivedGraph: buildDerivedWorkflowGraph(definition),
    issues: [],
  });
}

async function getProjectOrThrow(
  ctx: import('../../context').NousContext,
  projectId: ProjectId,
) {
  const project = await ctx.projectStore.get(projectId);
  if (!project) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Project ${projectId} not found`,
    });
  }
  return project;
}

async function listProjectTraces(
  ctx: import('../../context').NousContext,
  projectId: ProjectId,
  limit = 10,
): Promise<ExecutionTrace[]> {
  const raw = await ctx.documentStore.query<Record<string, unknown>>(TRACE_COLLECTION, {
    where: { projectId },
    orderBy: 'startedAt',
    orderDirection: 'desc',
    limit,
  });

  return raw
    .map((item) => ExecutionTraceSchema.safeParse(item))
    .filter((result): result is { success: true; data: ExecutionTrace } => result.success)
    .map((result) => result.data);
}

function deriveNodeStatus(
  nodeState: WorkflowRunState['nodeStates'][string] | null,
  runtimeAvailability: 'live' | 'no_active_run' | 'degraded_runtime_unavailable',
): WorkflowNodeProjectionStatus {
  if (runtimeAvailability === 'degraded_runtime_unavailable') {
    return 'degraded';
  }
  return nodeState?.status ?? 'pending';
}

export const projectsRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.projectStore.list();
  }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(['protocol', 'intent', 'hybrid']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString();
      const id = randomUUID() as ProjectId;
      const config = ctx.config.get() as {
        defaults?: {
          memoryAccessPolicy?: { canReadFrom: string; canBeReadBy: string; inheritsGlobal: boolean };
          escalationChannels?: string[];
        };
      };
      const defaults = config.defaults ?? {};
      const memoryAccessPolicy = (defaults.memoryAccessPolicy &&
        typeof defaults.memoryAccessPolicy === 'object' &&
        'canReadFrom' in defaults.memoryAccessPolicy &&
        'canBeReadBy' in defaults.memoryAccessPolicy &&
        'inheritsGlobal' in defaults.memoryAccessPolicy
        ? defaults.memoryAccessPolicy
        : { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: true }) as {
        canReadFrom: 'all' | 'none';
        canBeReadBy: 'all' | 'none';
        inheritsGlobal: boolean;
      };
      const escalationChannels = (Array.isArray(defaults.escalationChannels)
        ? defaults.escalationChannels
        : ['in-app']) as ('in-app' | 'push' | 'email' | 'signal' | 'slack' | 'sms' | 'voice')[];

      await ctx.projectStore.create({
        id,
        name: input.name,
        type: input.type ?? 'hybrid',
        pfcTier: 3,
        memoryAccessPolicy,
        escalationChannels,
        retrievalBudgetTokens: 500,
        createdAt: now,
        updatedAt: now,
      });

      const created = await ctx.projectStore.get(id);
      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Project creation failed',
        });
      }
      return created;
    }),

  get: publicProcedure
    .input(z.object({ id: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.projectStore.get(input.id);
    }),

  update: publicProcedure
    .input(projectUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.projectStore.update(input.id, input.updates);
    }),

  workflowSnapshot: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        runId: WorkflowExecutionIdSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const recentRuns = await ctx.workflowEngine.listProjectRuns(input.projectId);
      const selectedRun =
        (input.runId
          ? recentRuns.find((run) => run.runId === input.runId)
          : recentRuns.find(activeRunStatus) ?? recentRuns[0]) ?? null;
      const selectedRunGraph = selectedRun
        ? await ctx.workflowEngine.getRunGraph(selectedRun.runId)
        : null;
      const workflowDefinition = selectWorkflowDefinition(
        project,
        selectedRun?.workflowDefinitionId,
      );

      let fallbackGraph = null;
      let degradedReasonCode: string | undefined;
      if (workflowDefinition) {
        try {
          fallbackGraph = buildDerivedWorkflowGraph(workflowDefinition);
        } catch {
          degradedReasonCode = 'workflow_definition_invalid';
        }
      }

      const runtimeAvailability =
        selectedRun && selectedRunGraph
          ? 'live'
          : selectedRun && !selectedRunGraph
            ? 'degraded_runtime_unavailable'
            : degradedReasonCode
              ? 'degraded_runtime_unavailable'
              : 'no_active_run';

      const graph = selectedRunGraph ?? fallbackGraph;
      const recentArtifacts = await ctx.artifactStore.list(
        input.projectId,
        selectedRun
          ? { workflowRunId: selectedRun.runId, includeAllVersions: false, limit: 20 }
          : { includeAllVersions: false, limit: 20 },
      );
      const recentTraces = await listProjectTraces(ctx, input.projectId, 10);
      const controlProjection = await ctx.maoProjectionService.getProjectControlProjection(
        input.projectId,
      );

      const nodeProjections = graph
        ? graph.topologicalOrder.map((nodeDefinitionId) => {
            const definition = graph.nodes[nodeDefinitionId]!.definition;
            const nodeState = selectedRun?.nodeStates[nodeDefinitionId] ?? null;
            const artifactRefs = recentArtifacts
              .filter(
                (record) => record.lineage?.workflowNodeDefinitionId === nodeDefinitionId,
              )
              .map((record) => record.artifactRef);
            const deepLinks = [
              {
                target: 'chat' as const,
                projectId: input.projectId,
                workflowRunId: selectedRun?.runId,
                nodeDefinitionId,
                dispatchLineageId: nodeState?.lastDispatchLineageId,
              },
              {
                target: 'traces' as const,
                projectId: input.projectId,
                workflowRunId: selectedRun?.runId,
                nodeDefinitionId,
                dispatchLineageId: nodeState?.lastDispatchLineageId,
              },
              {
                target: 'mao' as const,
                projectId: input.projectId,
                workflowRunId: selectedRun?.runId,
                nodeDefinitionId,
                dispatchLineageId: nodeState?.lastDispatchLineageId,
              },
              ...artifactRefs.map((artifactRef) => ({
                target: 'artifact' as const,
                projectId: input.projectId,
                workflowRunId: selectedRun?.runId,
                nodeDefinitionId,
                artifactRef,
                dispatchLineageId: nodeState?.lastDispatchLineageId,
              })),
            ];

            return {
              nodeDefinitionId,
              definition,
              nodeState,
              status: deriveNodeStatus(nodeState, runtimeAvailability),
              groupKey: `status:${deriveNodeStatus(nodeState, runtimeAvailability)}`,
              artifactRefs,
              traceIds: [],
              deepLinks,
            };
          })
        : [];

      return ProjectWorkflowSurfaceSnapshotSchema.parse({
        project: getProjectIdentity(project),
        workflowDefinition,
        graph,
        runtimeAvailability,
        selectedRunId: selectedRun?.runId,
        activeRunState: selectedRun,
        recentRuns,
        nodeProjections,
        recentArtifacts,
        recentTraces: recentTraces.map((trace) => ({
          traceId: trace.traceId,
          startedAt: trace.startedAt,
          completedAt: trace.completedAt,
          turnCount: trace.turns.length,
        })),
        controlProjection,
        diagnostics: {
          runtimePosture: 'single_process_local',
          degradedReasonCode,
          inspectFirstMode: workflowDefinition ? project.type : 'no-definition',
        },
      });
    }),

  validateWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        workflowDefinition: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getProjectOrThrow(ctx, input.projectId);
      return validateDraftDefinition(input.projectId, input.workflowDefinition);
    }),

  saveWorkflowDefinition: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        workflowDefinition: z.unknown(),
        setAsDefault: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const validation = validateDraftDefinition(input.projectId, input.workflowDefinition);

      if (!validation.valid || !validation.definition) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.issues.map((issue) => issue.message).join('; '),
        });
      }

      const saveInput = SaveWorkflowDefinitionInputSchema.parse({
        projectId: input.projectId,
        workflowDefinition: validation.definition,
        setAsDefault: input.setAsDefault,
      });

      const currentDefinitions = getWorkflowDefinitions(project);
      const nextDefinitions = currentDefinitions.some(
        (definition) => definition.id === saveInput.workflowDefinition.id,
      )
        ? currentDefinitions.map((definition) =>
            definition.id === saveInput.workflowDefinition.id
              ? saveInput.workflowDefinition
              : definition)
        : [...currentDefinitions, saveInput.workflowDefinition];

      await ctx.projectStore.update(input.projectId, {
        workflow: {
          definitions: nextDefinitions,
          defaultWorkflowDefinitionId: saveInput.setAsDefault
            ? saveInput.workflowDefinition.id
            : project.workflow?.defaultWorkflowDefinitionId ??
              saveInput.workflowDefinition.id,
        },
      });

      const updatedProject = await getProjectOrThrow(ctx, input.projectId);
      return {
        project: updatedProject,
        validation,
      };
    }),
});
