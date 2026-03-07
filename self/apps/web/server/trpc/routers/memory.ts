/**
 * Memory tRPC router.
 */
import { z } from 'zod';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import { router, publicProcedure } from '../trpc';
import type { NousContext } from '../../context';
import {
  ProjectIdSchema,
  MemoryEntryIdSchema,
  MemoryWriteCandidateSchema,
  ExecutionTraceSchema,
  MemoryEntrySchema,
  MemoryLifecycleStatusSchema,
  MemoryPlacementStateSchema,
  MemoryTypeSchema,
  PolicyDecisionRecordSchema,
  type MemoryEntry,
  type MemoryQueryFilter,
  type ProjectConfig,
} from '@nous/shared';

const TRACE_COLLECTION = 'execution_traces';
const policyEngine = new MemoryAccessPolicyEngine();

const MemoryInspectorScopeSchema = z.enum(['project', 'global', 'all']);
const MemoryInspectorSortFieldSchema = z.enum([
  'updatedAt',
  'createdAt',
  'confidence',
  'type',
  'sentiment',
]);
const MemoryInspectorSortDirectionSchema = z.enum(['asc', 'desc']);

const MemoryInspectorQuerySchema = z.object({
  projectId: ProjectIdSchema,
  scope: MemoryInspectorScopeSchema.default('project'),
  query: z.string().trim().min(1).optional(),
  types: z.array(MemoryTypeSchema).optional(),
  lifecycleStatus: MemoryLifecycleStatusSchema.optional(),
  includeSuperseded: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
  placementState: MemoryPlacementStateSchema.optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: MemoryInspectorSortFieldSchema.default('updatedAt'),
  sortDirection: MemoryInspectorSortDirectionSchema.default('desc'),
});

const MemoryInspectorDiagnosticsSchema = z.object({
  requestedScope: MemoryInspectorScopeSchema,
  projectInheritsGlobal: z.boolean(),
  globalScopeDecision: PolicyDecisionRecordSchema.optional(),
});

const MemoryInspectorResponseSchema = z.object({
  entries: z.array(MemoryEntrySchema),
  diagnostics: MemoryInspectorDiagnosticsSchema,
});

const MemoryDenialProjectionSchema = z.object({
  candidate: MemoryWriteCandidateSchema,
  reason: z.string(),
  decisionRecord: PolicyDecisionRecordSchema.optional(),
  traceId: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
});

type MemoryInspectorQuery = z.infer<typeof MemoryInspectorQuerySchema>;
type MemoryInspectorSortField = z.infer<typeof MemoryInspectorSortFieldSchema>;
type MemoryInspectorSortDirection = z.infer<
  typeof MemoryInspectorSortDirectionSchema
>;
type MemoryDenialProjection = z.infer<typeof MemoryDenialProjectionSchema>;

export const memoryRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listForProject(input.projectId);
    }),

  inspect: publicProcedure
    .input(MemoryInspectorQuerySchema)
    .output(MemoryInspectorResponseSchema)
    .query(async ({ ctx, input }) => {
      const project = await ctx.projectStore.get(input.projectId);
      if (!project) {
        return MemoryInspectorResponseSchema.parse({
          entries: [],
          diagnostics: {
            requestedScope: input.scope,
            projectInheritsGlobal: false,
          },
        });
      }

      const globalScopeDecision = await resolveGlobalScopeDecision(
        ctx,
        project,
        input,
      );
      const canReadGlobal = globalScopeDecision?.outcome !== 'denied';
      const projectEntries =
        input.scope === 'global'
          ? []
          : await queryEntries(ctx.mwcPipeline, buildProjectFilter(input, project.id));
      const globalEntries =
        input.scope === 'project' || !canReadGlobal
          ? []
          : await queryEntries(ctx.mwcPipeline, buildGlobalFilter(input));

      const combined = dedupeEntries([...projectEntries, ...globalEntries])
        .filter((entry) => matchesInspectorQuery(entry, input))
        .sort((left, right) => {
          const result = compareEntries(
            left,
            right,
            input.sortBy,
            input.sortDirection,
          );
          if (result !== 0) {
            return result;
          }
          return left.id.localeCompare(right.id);
        });

      const paged = combined.slice(input.offset, input.offset + input.limit);

      return MemoryInspectorResponseSchema.parse({
        entries: paged,
        diagnostics: {
          requestedScope: input.scope,
          projectInheritsGlobal: project.memoryAccessPolicy.inheritsGlobal,
          globalScopeDecision,
        },
      });
    }),

  denials: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .output(z.array(MemoryDenialProjectionSchema))
    .query(async ({ ctx, input }) => {
      const raw = await ctx.documentStore.query<Record<string, unknown>>(
        TRACE_COLLECTION,
        { where: { projectId: input.projectId } },
      );
      const denials: MemoryDenialProjection[] = [];
      for (const item of raw) {
        const parsed = ExecutionTraceSchema.safeParse(item);
        if (!parsed.success) continue;
        for (const turn of parsed.data.turns) {
          for (const d of turn.memoryDenials) {
            denials.push({
              candidate: d.candidate,
              reason: d.reason,
              decisionRecord: d.decisionRecord,
              traceId: parsed.data.traceId,
              timestamp: turn.timestamp,
            });
          }
        }
      }
      return z.array(MemoryDenialProjectionSchema).parse(denials);
    }),

  audit: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listMutationAudit(input.projectId);
    }),

  tombstones: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema.optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.listTombstones(input.projectId);
    }),

  export: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      return ctx.mwcPipeline.exportForProject(input.projectId);
    }),

  supersede: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        replacement: MemoryWriteCandidateSchema,
        projectId: ProjectIdSchema.optional(),
        reason: z.string().default('operator supersede entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'supersede',
        actor: 'operator',
        targetEntryId: input.id,
        replacementCandidate: input.replacement,
        projectId: input.projectId ?? input.replacement.projectId,
        reason: input.reason,
        traceId: input.replacement.provenance.traceId,
        evidenceRefs: [],
      });
    }),

  promote: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        reason: z.string().default('operator promote entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'promote-global',
        actor: 'operator',
        targetEntryId: input.id,
        reason: input.reason,
        evidenceRefs: [],
      });
    }),

  demote: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema,
        projectId: ProjectIdSchema,
        reason: z.string().default('operator demote entry'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.mwcPipeline.mutate({
        action: 'demote-project',
        actor: 'operator',
        targetEntryId: input.id,
        projectId: input.projectId,
        reason: input.reason,
        evidenceRefs: [],
      });
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: MemoryEntryIdSchema.optional(),
        projectId: ProjectIdSchema.optional(),
        hard: z.boolean().optional(),
        rationale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const action = input.hard ? 'hard-delete' : 'soft-delete';
        const result = await ctx.mwcPipeline.mutate({
          action,
          actor: 'operator',
          targetEntryId: input.id,
          projectId: input.projectId,
          reason: input.hard
            ? 'operator hard delete entry'
            : 'operator soft delete entry',
          principalOverride: input.hard && input.rationale
            ? { rationale: input.rationale }
            : undefined,
          evidenceRefs: [],
        });
        return { deleted: result.applied ? 1 : 0, result };
      }
      if (input.projectId) {
        const count = await ctx.mwcPipeline.deleteAllForProject(input.projectId);
        return { deleted: count };
      }
      return { deleted: 0 };
    }),
});

function buildProjectFilter(
  input: MemoryInspectorQuery,
  projectId: ProjectConfig['id'],
): MemoryQueryFilter {
  return buildSharedFilter(input, { projectId });
}

function buildGlobalFilter(input: MemoryInspectorQuery): MemoryQueryFilter {
  return buildSharedFilter(input, { scope: 'global' });
}

function buildSharedFilter(
  input: MemoryInspectorQuery,
  overrides: Partial<MemoryQueryFilter>,
): MemoryQueryFilter {
  return {
    projectId: overrides.projectId,
    scope: overrides.scope,
    type: input.types?.length === 1 ? input.types[0] : undefined,
    tags: input.tags?.length ? input.tags : undefined,
    lifecycleStatus: input.lifecycleStatus,
    includeSuperseded: input.lifecycleStatus ? undefined : input.includeSuperseded,
    includeDeleted: input.lifecycleStatus ? undefined : input.includeDeleted,
    placementState: input.placementState,
  };
}

async function resolveGlobalScopeDecision(
  ctx: NousContext,
  project: ProjectConfig,
  input: MemoryInspectorQuery,
) {
  if (input.scope === 'project') {
    return undefined;
  }

  const controlState = await ctx.opctlService.getProjectControlState(input.projectId);
  return policyEngine.evaluate({
    action: 'retrieve',
    fromProjectId: input.projectId,
    includeGlobal: true,
    projectPolicy: project.memoryAccessPolicy,
    projectControlState: controlState,
  }).decisionRecord;
}

function queryEntries(
  pipeline: NousContext['mwcPipeline'],
  filter: MemoryQueryFilter,
) {
  return (
    pipeline as NousContext['mwcPipeline'] & {
      queryEntries: (nextFilter: MemoryQueryFilter) => Promise<MemoryEntry[]>;
    }
  ).queryEntries(filter);
}

function dedupeEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const byId = new Map<string, MemoryEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function matchesInspectorQuery(
  entry: MemoryEntry,
  input: MemoryInspectorQuery,
): boolean {
  if (input.types?.length && !input.types.includes(entry.type)) {
    return false;
  }

  if (input.query == null) {
    return true;
  }

  const needle = input.query.toLowerCase();
  return [
    entry.content,
    entry.type,
    entry.scope,
    entry.lifecycleStatus,
    entry.placementState,
    entry.provenance.source,
    entry.context,
    entry.action,
    entry.outcome,
    entry.reason,
    entry.sentiment,
    ...entry.tags,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .some((value) => value.toLowerCase().includes(needle));
}

function compareEntries(
  left: MemoryEntry,
  right: MemoryEntry,
  sortBy: MemoryInspectorSortField,
  sortDirection: MemoryInspectorSortDirection,
): number {
  const direction = sortDirection === 'asc' ? 1 : -1;

  if (sortBy === 'confidence') {
    return direction * compareNumbers(left.confidence, right.confidence);
  }

  if (sortBy === 'type') {
    return direction * compareEnumValue(left.type, right.type, MEMORY_TYPE_ORDER);
  }

  if (sortBy === 'sentiment') {
    return direction * compareEnumValue(
      left.sentiment,
      right.sentiment,
      SENTIMENT_ORDER,
    );
  }

  const leftValue = sortBy === 'createdAt' ? left.createdAt : left.updatedAt;
  const rightValue = sortBy === 'createdAt' ? right.createdAt : right.updatedAt;
  if (leftValue === rightValue) {
    return 0;
  }
  return leftValue < rightValue ? -direction : direction;
}

function compareNumbers(left: number, right: number): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareEnumValue(
  left: string | undefined,
  right: string | undefined,
  order: readonly string[],
): number {
  const leftIndex = left == null ? Number.MAX_SAFE_INTEGER : order.indexOf(left);
  const rightIndex = right == null ? Number.MAX_SAFE_INTEGER : order.indexOf(right);
  return compareNumbers(leftIndex, rightIndex);
}

const MEMORY_TYPE_ORDER = [
  'fact',
  'preference',
  'experience-record',
  'distilled-pattern',
  'task-state',
] as const;

const SENTIMENT_ORDER = [
  'strong-positive',
  'weak-positive',
  'neutral',
  'weak-negative',
  'strong-negative',
] as const;
