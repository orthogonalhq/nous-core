/**
 * Memory tRPC router.
 */
import { z } from 'zod';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import {
  DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  analyzeSourceRecords,
  createPatternLifecycleSnapshot,
  deriveConfidenceTier,
  evaluateProductionPromotion,
  toEscalationSignal,
  toLearnedBehaviorExplanation,
  toPhase6ConfidenceSignalExport,
  toPhase6DistilledPatternExport,
} from '@nous/memory-distillation';
import { evaluateConfidenceGovernanceRuntime } from '@nous/cortex-pfc';
import { router, publicProcedure } from '../trpc';
import type { NousContext } from '../../context';
import {
  ConfidenceDecayStateSchema,
  ConfidenceGovernanceEvaluationResultSchema,
  ConfidenceTierSchema,
  DEFAULT_CONFIDENCE_LIFECYCLE,
  type EscalationSignal,
  ExperienceRecordSchema,
  ProjectIdSchema,
  MemoryEntryIdSchema,
  MemoryWriteCandidateSchema,
  ExecutionTraceSchema,
  LearnedBehaviorExplanationSchema,
  MemoryEntrySchema,
  MemoryLifecycleStatusSchema,
  MemoryPlacementStateSchema,
  MemoryTypeSchema,
  Phase6ConfidenceSignalExportSchema,
  Phase6DistilledPatternExportSchema,
  PolicyDecisionRecordSchema,
  ProjectControlStateSchema,
  TraceEvidenceReferenceSchema,
  type ConfidenceGovernanceEvaluationResult,
  type ExperienceRecord,
  type LearnedBehaviorExplanation,
  type MemoryEntry,
  type MemoryQueryFilter,
  type Phase6ConfidenceSignalExport,
  type Phase6DistilledPatternExport,
  type ProjectConfig,
  type ProjectControlState,
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

const LearningPatternEntrySchema = MemoryEntrySchema.extend({
  type: z.literal('distilled-pattern'),
  basedOn: z.array(MemoryEntryIdSchema).default([]),
  supersedes: z.array(MemoryEntryIdSchema).default([]),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
});

const LearningConfidenceTierFilterSchema = z.union([
  ConfidenceTierSchema,
  z.literal('all'),
]);
const LearningDecayStateFilterSchema = z.union([
  ConfidenceDecayStateSchema,
  z.literal('all'),
]);
const LearningSortFieldSchema = z.enum([
  'updatedAt',
  'confidence',
  'supportingSignals',
  'sourceCount',
]);
const LearningSortDirectionSchema = z.enum(['asc', 'desc']);
const LearningDecisionScenarioIdSchema = z.enum([
  'may-safe',
  'should-safe',
  'must-governance-ceiling',
  'high-risk-memory-write',
  'current-control-state',
]);
const LineageIntegrityStatusSchema = z.enum([
  'complete',
  'missing-sources',
  'missing-evidence',
  'mixed',
]);
const RollbackVisibilitySchema = z.enum(['available', 'retired', 'degraded']);
const ProductionContradictionStatusSchema = z.enum([
  'none',
  'detected',
  'blocking',
]);
const ProductionStalenessStatusSchema = z.enum(['fresh', 'aging', 'stale']);

const LearningOverviewQuerySchema = z.object({
  projectId: ProjectIdSchema,
  query: z.string().trim().min(1).optional(),
  tier: LearningConfidenceTierFilterSchema.default('all'),
  decayState: LearningDecayStateFilterSchema.default('all'),
  includeRetired: z.boolean().default(false),
  sortBy: LearningSortFieldSchema.default('updatedAt'),
  sortDirection: LearningSortDirectionSchema.default('desc'),
});

const LearningLifecycleEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'pattern-created',
    'latest-supporting-signal',
    'aging-threshold',
    'stale-threshold',
    'retirement-flagged',
    'rollback-visibility',
  ]),
  label: z.string().min(1),
  at: z.string().datetime().optional(),
  derived: z.literal(true),
  relatedEntryId: MemoryEntryIdSchema.optional(),
});

const LearningDecisionProjectionSchema = z.object({
  scenarioId: LearningDecisionScenarioIdSchema,
  label: z.string().min(1),
  projectionBasis: z.enum(['representative', 'current-control-state']),
  explanation: LearnedBehaviorExplanationSchema,
  evaluation: ConfidenceGovernanceEvaluationResultSchema,
});

const LearningPatternSummarySchema = z.object({
  pattern: Phase6DistilledPatternExportSchema,
  confidenceSignal: Phase6ConfidenceSignalExportSchema,
  contradictionStatus: ProductionContradictionStatusSchema,
  stalenessStatus: ProductionStalenessStatusSchema,
  flaggedForRetirement: z.boolean(),
  sourceCount: z.number().int().min(0),
  missingSourceCount: z.number().int().min(0),
  lineageIntegrityStatus: LineageIntegrityStatusSchema,
});

const LearningOverviewResponseSchema = z.object({
  items: z.array(LearningPatternSummarySchema),
});

const LearningPatternDetailSchema = z.object({
  pattern: LearningPatternEntrySchema,
  patternExport: Phase6DistilledPatternExportSchema,
  confidenceSignal: Phase6ConfidenceSignalExportSchema,
  sourceTimeline: z.array(ExperienceRecordSchema),
  lifecycleEvents: z.array(LearningLifecycleEventSchema),
  decisionProjections: z.array(LearningDecisionProjectionSchema),
  lineage: z.object({
    supersededIds: z.array(MemoryEntryIdSchema),
    missingSourceIds: z.array(MemoryEntryIdSchema),
    rollbackVisibility: RollbackVisibilitySchema,
    lineageIntegrityStatus: LineageIntegrityStatusSchema,
  }),
  diagnostics: z.object({
    projectControlState: ProjectControlStateSchema.optional(),
    historicalDecisionLogAvailable: z.literal(false),
    missingEvidenceRefs: z.boolean(),
  }),
});

type MemoryInspectorQuery = z.infer<typeof MemoryInspectorQuerySchema>;
type MemoryInspectorSortField = z.infer<typeof MemoryInspectorSortFieldSchema>;
type MemoryInspectorSortDirection = z.infer<
  typeof MemoryInspectorSortDirectionSchema
>;
type MemoryDenialProjection = z.infer<typeof MemoryDenialProjectionSchema>;
type LearningPatternEntry = z.infer<typeof LearningPatternEntrySchema>;
type LearningOverviewQuery = z.infer<typeof LearningOverviewQuerySchema>;
type LearningSortField = z.infer<typeof LearningSortFieldSchema>;
type LearningSortDirection = z.infer<typeof LearningSortDirectionSchema>;
type LineageIntegrityStatus = z.infer<typeof LineageIntegrityStatusSchema>;
type RollbackVisibility = z.infer<typeof RollbackVisibilitySchema>;

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

  learningOverview: publicProcedure
    .input(LearningOverviewQuerySchema)
    .output(LearningOverviewResponseSchema)
    .query(async ({ ctx, input }) => {
      const entries = await ctx.mwcPipeline.queryEntries({
        projectId: input.projectId,
        type: 'distilled-pattern',
        includeSuperseded: true,
        includeDeleted: true,
      });

      const referenceAt = new Date().toISOString();
      const summaries = await Promise.all(
        entries
          .map(parseLearningPatternEntry)
          .filter((pattern): pattern is LearningPatternEntry => pattern != null)
          .map((pattern) =>
            buildLearningPatternSummary(ctx, pattern, {
              referenceAt,
            }),
          ),
      );

      const filtered = summaries
        .filter((summary) => matchesLearningOverviewQuery(summary, input))
        .sort((left, right) =>
          compareLearningSummaries(
            left,
            right,
            input.sortBy,
            input.sortDirection,
          ),
        );

      return LearningOverviewResponseSchema.parse({
        items: filtered,
      });
    }),

  learningDetail: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        patternId: MemoryEntryIdSchema,
      }),
    )
    .output(LearningPatternDetailSchema.nullable())
    .query(async ({ ctx, input }) => {
      const entry = await ctx.mwcPipeline.readEntry(input.patternId);
      const pattern = entry ? parseLearningPatternEntry(entry) : null;
      if (!pattern || pattern.projectId !== input.projectId) {
        return null;
      }

      const detail = await buildLearningPatternDetail(ctx, pattern, {
        projectId: input.projectId,
        referenceAt: new Date().toISOString(),
      });
      return LearningPatternDetailSchema.parse(detail);
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

async function buildLearningPatternSummary(
  ctx: NousContext,
  pattern: LearningPatternEntry,
  input: {
    referenceAt: string;
  },
) {
  const base = await buildLearningPatternBase(ctx, pattern, input);
  return LearningPatternSummarySchema.parse({
    pattern: base.patternExport,
    confidenceSignal: base.confidenceSignal,
    contradictionStatus: base.contradictionStatus,
    stalenessStatus: base.stalenessStatus,
    flaggedForRetirement: base.flaggedForRetirement,
    sourceCount: pattern.basedOn.length,
    missingSourceCount: base.missingSourceIds.length,
    lineageIntegrityStatus: base.lineageIntegrityStatus,
  });
}

async function buildLearningPatternDetail(
  ctx: NousContext,
  pattern: LearningPatternEntry,
  input: {
    projectId: ProjectConfig['id'];
    referenceAt: string;
  },
) {
  const base = await buildLearningPatternBase(ctx, pattern, input);
  const projectControlState = await resolveProjectControlState(ctx, input.projectId);

  return {
    pattern,
    patternExport: base.patternExport,
    confidenceSignal: base.confidenceSignal,
    sourceTimeline: base.sourceTimeline,
    lifecycleEvents: buildLearningLifecycleEvents({
      pattern,
      sourceTimeline: base.sourceTimeline,
      flaggedForRetirement: base.flaggedForRetirement,
      rollbackVisibility: base.rollbackVisibility,
    }),
    decisionProjections: await buildLearningDecisionProjections({
      pattern,
      patternExport: base.patternExport,
      confidenceSignal: base.confidenceSignal,
      sourceTimeline: base.sourceTimeline,
      projectControlState,
      referenceAt: input.referenceAt,
      missingEvidenceRefs: base.missingEvidenceRefs,
    }),
    lineage: {
      supersededIds: pattern.supersedes,
      missingSourceIds: base.missingSourceIds,
      rollbackVisibility: base.rollbackVisibility,
      lineageIntegrityStatus: base.lineageIntegrityStatus,
    },
    diagnostics: {
      projectControlState,
      historicalDecisionLogAvailable: false as const,
      missingEvidenceRefs: base.missingEvidenceRefs,
    },
  };
}

async function buildLearningPatternBase(
  ctx: NousContext,
  pattern: LearningPatternEntry,
  input: {
    referenceAt: string;
  },
): Promise<{
  patternExport: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  sourceTimeline: ExperienceRecord[];
  missingSourceIds: Array<z.infer<typeof MemoryEntryIdSchema>>;
  contradictionStatus: z.infer<typeof ProductionContradictionStatusSchema>;
  stalenessStatus: z.infer<typeof ProductionStalenessStatusSchema>;
  flaggedForRetirement: boolean;
  missingEvidenceRefs: boolean;
  lineageIntegrityStatus: LineageIntegrityStatus;
  rollbackVisibility: RollbackVisibility;
}> {
  const { sourceTimeline, missingSourceIds } = await resolvePatternSources(
    ctx.mwcPipeline,
    pattern,
  );
  const missingEvidenceRefs = pattern.evidenceRefs.length === 0;
  const patternExport = await toPhase6DistilledPatternExport(pattern);

  let confidenceSignal = buildFallbackConfidenceSignal(
    pattern,
    sourceTimeline.length,
  );
  let contradictionStatus: z.infer<typeof ProductionContradictionStatusSchema> =
    'none';
  let stalenessStatus: z.infer<typeof ProductionStalenessStatusSchema> = 'fresh';
  let flaggedForRetirement =
    pattern.confidence <
    DEFAULT_CONFIDENCE_LIFECYCLE.contradictionRetirementThreshold;

  if (sourceTimeline.length > 0) {
    const snapshot = createPatternLifecycleSnapshot(pattern, sourceTimeline, {
      referenceAt: input.referenceAt,
    });
    confidenceSignal = await toPhase6ConfidenceSignalExport(snapshot);
    contradictionStatus = snapshot.contradictionStatus;
    stalenessStatus = snapshot.stalenessStatus;
    flaggedForRetirement = snapshot.flaggedForRetirement;
  }

  const lineageIntegrityStatus = resolveLineageIntegrityStatus(
    missingSourceIds.length > 0,
    missingEvidenceRefs,
  );
  const rollbackVisibility = resolveRollbackVisibility(
    pattern,
    missingSourceIds.length > 0,
    missingEvidenceRefs,
  );

  return {
    patternExport,
    confidenceSignal,
    sourceTimeline,
    missingSourceIds,
    contradictionStatus,
    stalenessStatus,
    flaggedForRetirement,
    missingEvidenceRefs,
    lineageIntegrityStatus,
    rollbackVisibility,
  };
}

async function buildLearningDecisionProjections(input: {
  pattern: LearningPatternEntry;
  patternExport: Phase6DistilledPatternExport;
  confidenceSignal: Phase6ConfidenceSignalExport;
  sourceTimeline: ExperienceRecord[];
  projectControlState: ProjectControlState | undefined;
  referenceAt: string;
  missingEvidenceRefs: boolean;
}): Promise<Array<{
  scenarioId: z.infer<typeof LearningDecisionScenarioIdSchema>;
  label: string;
  projectionBasis: 'representative' | 'current-control-state';
  explanation: LearnedBehaviorExplanation;
  evaluation: ConfidenceGovernanceEvaluationResult;
}>> {
  if (input.missingEvidenceRefs) {
    return [];
  }

  const requiresEscalationContext =
    input.confidenceSignal.tier === 'low' ||
    input.confidenceSignal.decayState !== 'stable';
  let escalationSignal: EscalationSignal | undefined;

  if (requiresEscalationContext && input.sourceTimeline.length > 0) {
    const analysis = analyzeSourceRecords(input.sourceTimeline, {
      referenceAt: input.referenceAt,
    });
    const promotion = evaluateProductionPromotion(input.pattern, analysis);
    escalationSignal = await toEscalationSignal({
      analysis,
      decision: promotion,
      patternId: input.pattern.id,
    });
  }

  const scenarios: Array<{
    scenarioId: z.infer<typeof LearningDecisionScenarioIdSchema>;
    label: string;
    governance: 'may' | 'should' | 'must';
    actionCategory: 'mao-projection' | 'memory-write';
    projectControlState: ProjectControlState;
    projectionBasis: 'representative' | 'current-control-state';
  }> = [
    {
      scenarioId: 'may-safe' as const,
      label: 'Representative MAY / safe action',
      governance: 'may' as const,
      actionCategory: 'mao-projection' as const,
      projectControlState: 'running' as const,
      projectionBasis: 'representative' as const,
    },
    {
      scenarioId: 'should-safe' as const,
      label: 'Representative SHOULD / safe action',
      governance: 'should' as const,
      actionCategory: 'mao-projection' as const,
      projectControlState: 'running' as const,
      projectionBasis: 'representative' as const,
    },
    {
      scenarioId: 'must-governance-ceiling' as const,
      label: 'Representative MUST / governance ceiling',
      governance: 'must' as const,
      actionCategory: 'mao-projection' as const,
      projectControlState: 'running' as const,
      projectionBasis: 'representative' as const,
    },
    {
      scenarioId: 'high-risk-memory-write' as const,
      label: 'Representative high-risk memory write',
      governance: 'may' as const,
      actionCategory: 'memory-write' as const,
      projectControlState: 'running' as const,
      projectionBasis: 'representative' as const,
    },
  ];

  if (input.projectControlState && input.projectControlState !== 'running') {
    scenarios.push({
      scenarioId: 'current-control-state' as const,
      label: 'Current control-state projection',
      governance: 'may' as const,
      actionCategory: 'mao-projection' as const,
      projectControlState: input.projectControlState,
      projectionBasis: 'current-control-state' as const,
    });
  }

  const projections = await Promise.all(
    scenarios.map(async (scenario) => {
      const explanation = await toLearnedBehaviorExplanation(
        input.pattern,
        `learning-projection:${input.pattern.id}:${scenario.scenarioId}`,
      );
      const evaluation = evaluateConfidenceGovernanceRuntime({
        governance: scenario.governance,
        actionCategory: scenario.actionCategory,
        projectControlState: scenario.projectControlState,
        pattern: input.patternExport,
        confidenceSignal: input.confidenceSignal,
        explanation,
        escalationSignal,
      });

      return LearningDecisionProjectionSchema.parse({
        scenarioId: scenario.scenarioId,
        label: scenario.label,
        projectionBasis: scenario.projectionBasis,
        explanation,
        evaluation,
      });
    }),
  );

  return projections;
}

async function resolvePatternSources(
  pipeline: NousContext['mwcPipeline'],
  pattern: LearningPatternEntry,
): Promise<{
  sourceTimeline: ExperienceRecord[];
  missingSourceIds: Array<z.infer<typeof MemoryEntryIdSchema>>;
}> {
  if (pattern.basedOn.length === 0) {
    return {
      sourceTimeline: [],
      missingSourceIds: [],
    };
  }

  const entries = await pipeline.readEntries(pattern.basedOn);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sourceTimeline: ExperienceRecord[] = [];
  const missingSourceIds: Array<z.infer<typeof MemoryEntryIdSchema>> = [];

  for (const sourceId of pattern.basedOn) {
    const entry = byId.get(sourceId);
    if (!entry) {
      missingSourceIds.push(sourceId);
      continue;
    }

    const parsed = ExperienceRecordSchema.safeParse(entry);
    if (!parsed.success) {
      missingSourceIds.push(sourceId);
      continue;
    }

    sourceTimeline.push(parsed.data);
  }

  return {
    sourceTimeline: sortSourceTimeline(sourceTimeline),
    missingSourceIds,
  };
}

function parseLearningPatternEntry(entry: MemoryEntry): LearningPatternEntry | null {
  if (entry.type !== 'distilled-pattern') {
    return null;
  }

  const parsed = LearningPatternEntrySchema.safeParse(entry);
  return parsed.success ? parsed.data : null;
}

function buildFallbackConfidenceSignal(
  pattern: LearningPatternEntry,
  supportingSignals: number,
): Phase6ConfidenceSignalExport {
  return Phase6ConfidenceSignalExportSchema.parse({
    patternId: pattern.id,
    entryId: pattern.id,
    confidence: pattern.confidence,
    supportingSignals,
    tier: deriveConfidenceTier(
      pattern.confidence,
      supportingSignals,
      DEFAULT_CONFIDENCE_LIFECYCLE,
    ),
  });
}

function buildLearningLifecycleEvents(input: {
  pattern: LearningPatternEntry;
  sourceTimeline: ExperienceRecord[];
  flaggedForRetirement: boolean;
  rollbackVisibility: RollbackVisibility;
}) {
  const events = [
    LearningLifecycleEventSchema.parse({
      id: `${input.pattern.id}:pattern-created`,
      kind: 'pattern-created',
      label: 'Pattern created from canonical distillation output.',
      at: input.pattern.createdAt,
      derived: true as const,
    }),
  ];

  if (input.sourceTimeline.length > 0) {
    const latestSupporting = [...input.sourceTimeline]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]!;
    events.push(
      LearningLifecycleEventSchema.parse({
        id: `${input.pattern.id}:latest-supporting-signal`,
        kind: 'latest-supporting-signal',
        label: 'Latest supporting experience record observed.',
        at: latestSupporting.updatedAt,
        derived: true as const,
        relatedEntryId: latestSupporting.id,
      }),
    );
    events.push(
      LearningLifecycleEventSchema.parse({
        id: `${input.pattern.id}:aging-threshold`,
        kind: 'aging-threshold',
        label: 'Pattern enters the aging threshold if no fresher support arrives.',
        at: addDays(
          latestSupporting.updatedAt,
          DEFAULT_PRODUCTION_SIGNAL_CONFIG.agingDays,
        ),
        derived: true as const,
        relatedEntryId: latestSupporting.id,
      }),
    );
    events.push(
      LearningLifecycleEventSchema.parse({
        id: `${input.pattern.id}:stale-threshold`,
        kind: 'stale-threshold',
        label: 'Pattern enters the stale threshold if support remains unchanged.',
        at: addDays(
          latestSupporting.updatedAt,
          DEFAULT_PRODUCTION_SIGNAL_CONFIG.staleDays,
        ),
        derived: true as const,
        relatedEntryId: latestSupporting.id,
      }),
    );
  }

  if (input.flaggedForRetirement) {
    events.push(
      LearningLifecycleEventSchema.parse({
        id: `${input.pattern.id}:retirement-flagged`,
        kind: 'retirement-flagged',
        label: 'Current confidence and supporting signals flag this pattern for retirement review.',
        at: input.pattern.updatedAt,
        derived: true as const,
      }),
    );
  }

  events.push(
    LearningLifecycleEventSchema.parse({
      id: `${input.pattern.id}:rollback-visibility`,
      kind: 'rollback-visibility',
      label: `Rollback visibility is currently ${input.rollbackVisibility}.`,
      at: input.pattern.updatedAt,
      derived: true as const,
    }),
  );

  return events.sort((left, right) => {
    if (left.at == null && right.at == null) {
      return left.id.localeCompare(right.id);
    }
    if (left.at == null) {
      return 1;
    }
    if (right.at == null) {
      return -1;
    }
    if (left.at === right.at) {
      return left.id.localeCompare(right.id);
    }
    return right.at.localeCompare(left.at);
  });
}

async function resolveProjectControlState(
  ctx: NousContext,
  projectId: ProjectConfig['id'],
): Promise<ProjectControlState | undefined> {
  try {
    return await ctx.opctlService.getProjectControlState(projectId);
  } catch {
    return undefined;
  }
}

function matchesLearningOverviewQuery(
  summary: z.infer<typeof LearningPatternSummarySchema>,
  input: LearningOverviewQuery,
): boolean {
  if (input.tier !== 'all' && summary.confidenceSignal.tier !== input.tier) {
    return false;
  }
  if (
    input.decayState !== 'all' &&
    summary.confidenceSignal.decayState !== input.decayState
  ) {
    return false;
  }
  if (!input.includeRetired && summary.flaggedForRetirement) {
    return false;
  }
  if (!input.query) {
    return true;
  }

  const needle = input.query.toLowerCase();
  return [
    summary.pattern.content,
    summary.pattern.id,
    ...summary.pattern.tags,
    ...summary.pattern.basedOn,
    ...summary.pattern.supersedes,
  ].some((value) => value.toLowerCase().includes(needle));
}

function compareLearningSummaries(
  left: z.infer<typeof LearningPatternSummarySchema>,
  right: z.infer<typeof LearningPatternSummarySchema>,
  sortBy: LearningSortField,
  sortDirection: LearningSortDirection,
): number {
  const direction = sortDirection === 'asc' ? 1 : -1;

  if (sortBy === 'confidence') {
    return (
      direction *
      compareNumbers(
        left.confidenceSignal.confidence,
        right.confidenceSignal.confidence,
      )
    );
  }

  if (sortBy === 'supportingSignals') {
    return (
      direction *
      compareNumbers(
        left.confidenceSignal.supportingSignals,
        right.confidenceSignal.supportingSignals,
      )
    );
  }

  if (sortBy === 'sourceCount') {
    return direction * compareNumbers(left.sourceCount, right.sourceCount);
  }

  if (left.pattern.updatedAt === right.pattern.updatedAt) {
    return left.pattern.id.localeCompare(right.pattern.id);
  }
  return left.pattern.updatedAt < right.pattern.updatedAt ? -direction : direction;
}

function resolveLineageIntegrityStatus(
  hasMissingSources: boolean,
  missingEvidenceRefs: boolean,
): LineageIntegrityStatus {
  if (hasMissingSources && missingEvidenceRefs) {
    return 'mixed';
  }
  if (hasMissingSources) {
    return 'missing-sources';
  }
  if (missingEvidenceRefs) {
    return 'missing-evidence';
  }
  return 'complete';
}

function resolveRollbackVisibility(
  pattern: LearningPatternEntry,
  hasMissingSources: boolean,
  missingEvidenceRefs: boolean,
): RollbackVisibility {
  if (pattern.lifecycleStatus !== 'active') {
    return 'retired';
  }
  if (hasMissingSources || missingEvidenceRefs) {
    return 'degraded';
  }
  return 'available';
}

function sortSourceTimeline(records: ExperienceRecord[]): ExperienceRecord[] {
  return [...records].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return left.id.localeCompare(right.id);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function addDays(value: string, days: number): string | undefined {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return new Date(timestamp + days * 24 * 60 * 60 * 1000).toISOString();
}

function queryEntries(
  pipeline: NousContext['mwcPipeline'],
  filter: MemoryQueryFilter,
) {
  return pipeline.queryEntries(filter);
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
