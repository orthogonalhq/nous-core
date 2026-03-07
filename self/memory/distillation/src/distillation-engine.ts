/**
 * DistillationEngine - implements IDistillationEngine.
 * Phase 8.5: structured-summary-v1 production path, guarded promotion,
 * compensation rollback, confidence lifecycle, and observability hooks.
 *
 * Policy gate: Caller MUST invoke policy evaluation before distillation writes
 * when scope is cross-project or global. See phase-4.3-policy-gate-verification.test.ts.
 */
import type {
  ILtmStore,
  ExperienceCluster,
  DistilledPattern,
  DistillationResult,
  MemoryQueryFilter,
  ConfidenceRefreshInput,
  ConfidenceDecayInput,
  ConfidenceUpdateResult,
  ProjectId,
  SupersessionReversalRequest,
} from '@nous/shared';
import {
  DistilledPatternSchema,
  DistillationResultSchema,
  ExperienceRecordSchema,
  DEFAULT_DISTILLATION_CLUSTER_CONFIG,
  DEFAULT_CONFIDENCE_LIFECYCLE,
  type ExperienceRecord,
  type DistillationClusterConfig,
  type ConfidenceLifecycle,
} from '@nous/shared';
import { identifyClusters } from './clustering.js';
import { computeInitialConfidence } from './confidence.js';
import { updateConfidence as doUpdateConfidence } from './confidence-lifecycle.js';
import { reverseSupersession as doReverseSupersession } from './supersession-reversal.js';
import {
  type DistillationObserver,
  type ProductionDistillationAuditSink,
  type ProductionPromotionGuardDecision,
  type ProductionSignalAnalysis,
  type ProductionSignalConfig,
  DEFAULT_PRODUCTION_SIGNAL_CONFIG,
  computeSourceTraceCoverageRatio,
  emitObserverLog,
  emitObserverMetric,
} from './production-contracts.js';
import { analyzeClusterSignals } from './production-signal-analysis.js';
import { evaluateProductionPromotion } from './production-guards.js';
import { buildStructuredSummary } from './structured-summary.js';

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

interface AppendAuditRecordCapable {
  appendAuditRecord: ProductionDistillationAuditSink['appendAuditRecord'];
}

function resolveAuditSink(
  ltm: ILtmStore,
  auditSink?: ProductionDistillationAuditSink,
): ProductionDistillationAuditSink | undefined {
  if (auditSink) {
    return auditSink;
  }

  if (
    'appendAuditRecord' in ltm &&
    typeof (ltm as AppendAuditRecordCapable).appendAuditRecord === 'function'
  ) {
    return {
      appendAuditRecord: (input) =>
        (ltm as AppendAuditRecordCapable).appendAuditRecord(input),
    };
  }

  return undefined;
}

export interface DistillationEngineConfig {
  clusterConfig?: DistillationClusterConfig;
  confidenceConfig?: ConfidenceLifecycle;
  signalConfig?: ProductionSignalConfig;
  now?: () => string;
  idFactory?: () => string;
  auditSink?: ProductionDistillationAuditSink;
  observer?: DistillationObserver;
}

interface DraftContext {
  analysis: ProductionSignalAnalysis;
  decision: ProductionPromotionGuardDecision;
  pattern: DistilledPattern;
}

export class DistillationEngine {
  private readonly clusterConfig: DistillationClusterConfig;
  private readonly confidenceConfig: ConfidenceLifecycle;
  private readonly signalConfig: ProductionSignalConfig;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly auditSink?: ProductionDistillationAuditSink;
  private readonly observer?: DistillationObserver;

  constructor(
    private readonly ltm: ILtmStore,
    config: DistillationEngineConfig = {},
  ) {
    this.clusterConfig =
      config.clusterConfig ?? DEFAULT_DISTILLATION_CLUSTER_CONFIG;
    this.confidenceConfig =
      config.confidenceConfig ?? DEFAULT_CONFIDENCE_LIFECYCLE;
    this.signalConfig = config.signalConfig ?? DEFAULT_PRODUCTION_SIGNAL_CONFIG;
    this.now = config.now ?? nowIso;
    this.idFactory = config.idFactory ?? generateId;
    this.auditSink = resolveAuditSink(ltm, config.auditSink);
    this.observer = config.observer;
  }

  async identifyClusters(projectId?: ProjectId): Promise<ExperienceCluster[]> {
    const filter: MemoryQueryFilter = {
      type: 'experience-record',
      lifecycleStatus: 'active',
      ...(projectId && { projectId }),
    };
    const records = await this.ltm.query(filter);
    const expRecords = records
      .filter((record): record is ExperienceRecord => record.type === 'experience-record')
      .map((record) => ExperienceRecordSchema.parse(record));

    return identifyClusters(expRecords, this.clusterConfig);
  }

  async distill(cluster: ExperienceCluster): Promise<DistilledPattern> {
    const draft = this.createDraftContext(cluster);
    return draft.pattern;
  }

  async runDistillationPass(projectId?: ProjectId): Promise<DistillationResult> {
    const clusters = await this.identifyClusters(projectId);
    const patternsCreated: DistilledPattern[] = [];
    const recordsSuperseded: string[] = [];

    for (const cluster of clusters) {
      const draft = this.createDraftContext(cluster);
      await this.recordDecision(cluster, draft.analysis, draft.decision);

      if (draft.decision.decision !== 'promote') {
        continue;
      }

      await this.persistPromotion(cluster, draft);
      patternsCreated.push(draft.pattern);
      recordsSuperseded.push(...draft.analysis.basedOn);
    }

    return DistillationResultSchema.parse({
      patternsCreated,
      recordsSuperseded,
      clustersProcessed: clusters.length,
    });
  }

  async updateConfidence(
    input: ConfidenceRefreshInput | ConfidenceDecayInput,
  ): Promise<ConfidenceUpdateResult> {
    return doUpdateConfidence(this.ltm, input, this.confidenceConfig, {
      now: this.now,
      observer: this.observer,
      signalConfig: this.signalConfig,
    });
  }

  async reverseSupersession(request: SupersessionReversalRequest): Promise<void> {
    return doReverseSupersession(this.ltm, request, {
      now: this.now,
      observer: this.observer,
    });
  }

  private createDraftContext(cluster: ExperienceCluster): DraftContext {
    const analysis = analyzeClusterSignals(cluster, {
      referenceAt: this.now(),
      signalConfig: this.signalConfig,
    });
    const confidence = computeInitialConfidence(
      cluster.records,
      this.confidenceConfig,
    );
    const initialDecision = evaluateProductionPromotion(
      DistilledPatternSchema.parse({
        id: this.idFactory(),
        content: '',
        type: 'distilled-pattern',
        scope: 'project',
        projectId: cluster.projectId,
        confidence,
        sensitivity: [
          ...new Set(cluster.records.flatMap((record) => record.sensitivity ?? [])),
        ].sort(),
        retention: 'permanent',
        provenance: {
          traceId: this.idFactory(),
          source: 'distillation',
          timestamp: this.now(),
        },
        tags: [...new Set(cluster.records.flatMap((record) => record.tags))].sort(),
        createdAt: this.now(),
        updatedAt: this.now(),
        basedOn: analysis.basedOn,
        supersedes: analysis.basedOn,
        evidenceRefs: analysis.evidenceRefs,
      }),
      analysis,
      this.confidenceConfig,
    );

    const pattern = DistilledPatternSchema.parse({
      id: this.idFactory(),
      content: buildStructuredSummary({
        supportingSignalCount: analysis.supportingSignalCount,
        positiveCount: analysis.positiveCount,
        negativeCount: analysis.negativeCount,
        neutralCount: analysis.neutralCount,
        latestAgeDays: analysis.latestAgeDays,
        contradictionStatus: analysis.contradictionStatus,
        stalenessStatus: analysis.stalenessStatus,
        decision: initialDecision.decision,
      }),
      type: 'distilled-pattern',
      scope: 'project',
      projectId: cluster.projectId,
      confidence,
      sensitivity: [
        ...new Set(cluster.records.flatMap((record) => record.sensitivity ?? [])),
      ].sort(),
      retention: 'permanent',
      provenance: {
        traceId: this.idFactory(),
        source: 'distillation',
        timestamp: this.now(),
      },
      tags: [...new Set(cluster.records.flatMap((record) => record.tags))].sort(),
      createdAt: this.now(),
      updatedAt: this.now(),
      basedOn: analysis.basedOn,
      supersedes: analysis.basedOn,
      evidenceRefs: analysis.evidenceRefs,
    });
    const decision = evaluateProductionPromotion(
      pattern,
      analysis,
      this.confidenceConfig,
    );

    return { analysis, decision, pattern };
  }

  private async recordDecision(
    cluster: ExperienceCluster,
    analysis: ProductionSignalAnalysis,
    decision: ProductionPromotionGuardDecision,
  ): Promise<void> {
    await emitObserverMetric(this.observer, {
      name: 'distillation_production_decision_total',
      value: 1,
      labels: {
        decision: decision.decision,
        contradictionStatus: analysis.contradictionStatus,
        stalenessStatus: analysis.stalenessStatus,
      },
    });
    await emitObserverMetric(this.observer, {
      name: 'distillation_source_trace_coverage_ratio',
      value: computeSourceTraceCoverageRatio(analysis),
      labels: {
        decision: decision.decision,
      },
    });
    await emitObserverLog(this.observer, {
      event: 'distillation.production.decision',
      fields: {
        projectId: cluster.projectId,
        clusterKey: cluster.clusterKey,
        basedOnCount: analysis.basedOn.length,
        sourceTraceIdCount: analysis.sourceTraceIds.length,
        supportingSignalCount: analysis.supportingSignalCount,
        decision: decision.decision,
        confidence: decision.confidence,
        tier: decision.tier,
        contradictionStatus: analysis.contradictionStatus,
        stalenessStatus: analysis.stalenessStatus,
        supersessionEligible: decision.supersessionEligible,
        reasonCodes: decision.reasonCodes,
      },
    });
  }

  private async persistPromotion(
    cluster: ExperienceCluster,
    draft: DraftContext,
  ): Promise<void> {
    try {
      await this.ltm.write(draft.pattern);
      await emitObserverMetric(this.observer, {
        name: 'distillation_pattern_persist_total',
        value: 1,
        labels: {
          outcome: 'success',
          decision: draft.decision.decision,
        },
      });
    } catch (error) {
      await emitObserverMetric(this.observer, {
        name: 'distillation_pattern_persist_total',
        value: 1,
        labels: {
          outcome: 'failure',
          decision: draft.decision.decision,
        },
      });
      throw error;
    }

    try {
      await this.ltm.markSuperseded(draft.analysis.basedOn, draft.pattern.id);
      await emitObserverMetric(this.observer, {
        name: 'distillation_supersession_total',
        value: 1,
        labels: { outcome: 'success' },
      });
      await this.appendPromotionAudit(cluster, draft.pattern);
    } catch (error) {
      await emitObserverMetric(this.observer, {
        name: 'distillation_supersession_total',
        value: 1,
        labels: { outcome: 'failure' },
      });

      for (const sourceId of draft.analysis.basedOn) {
        const sourceEntry = await this.ltm.read(sourceId);
        if (sourceEntry?.supersededBy === draft.pattern.id) {
          await this.ltm.write({
            ...sourceEntry,
            supersededBy: undefined,
            lifecycleStatus: 'active',
            updatedAt: this.now(),
          });
        }
      }
      const deleted = await this.ltm.delete(draft.pattern.id);
      await emitObserverMetric(this.observer, {
        name: 'distillation_compensation_rollback_total',
        value: 1,
        labels: {
          reason: deleted ? 'supersession-mark-failure' : 'rollback-delete-failure',
        },
      });

      throw error;
    }
  }

  private async appendPromotionAudit(
    cluster: ExperienceCluster,
    pattern: DistilledPattern,
  ): Promise<void> {
    if (!this.auditSink) {
      return;
    }

    await this.auditSink.appendAuditRecord({
      id: this.idFactory() as any,
      action: 'supersede',
      actor: 'core',
      outcome: 'applied',
      reasonCode: 'MEM-SUPERSEDE-APPLIED',
      reason: `Promoted distilled pattern for cluster ${cluster.clusterKey}`,
      projectId: cluster.projectId,
      resultingEntryId: pattern.id,
      traceId: pattern.provenance.traceId,
      evidenceRefs: pattern.evidenceRefs,
      occurredAt: this.now(),
    });
  }
}
