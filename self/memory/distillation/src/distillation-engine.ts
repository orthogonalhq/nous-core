/**
 * DistillationEngine — implements IDistillationEngine.
 * Phase 4.3: Clustering, pattern generation, supersession, confidence lifecycle.
 *
 * Policy gate: Caller MUST invoke policy evaluation before distillation writes
 * when scope is cross-project or global. See phase-4.3-policy-gate-verification.test.ts.
 */
import type {
  ILtmStore,
  IDistillationEngine,
  ExperienceCluster,
  DistilledPattern,
  DistillationResult,
  MemoryEntryId,
  ProjectId,
  MemoryQueryFilter,
  ConfidenceRefreshInput,
  ConfidenceDecayInput,
  ConfidenceUpdateResult,
  SupersessionReversalRequest,
} from '@nous/shared';
import {
  DistilledPatternSchema,
  DistillationResultSchema,
  ExperienceRecordSchema,
  type ExperienceRecord,
} from '@nous/shared';
import { identifyClusters } from './clustering.js';
import { computeInitialConfidence } from './confidence.js';
import {
  DEFAULT_DISTILLATION_CLUSTER_CONFIG,
  DEFAULT_CONFIDENCE_LIFECYCLE,
  type DistillationClusterConfig,
  type ConfidenceLifecycle,
} from '@nous/shared';
import { updateConfidence as doUpdateConfidence } from './confidence-lifecycle.js';
import { reverseSupersession as doReverseSupersession } from './supersession-reversal.js';

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface DistillationEngineConfig {
  clusterConfig?: DistillationClusterConfig;
  confidenceConfig?: ConfidenceLifecycle;
}

export class DistillationEngine {
  constructor(
    private readonly ltm: ILtmStore,
    private readonly config: DistillationEngineConfig = {},
  ) {}

  async identifyClusters(projectId?: ProjectId): Promise<ExperienceCluster[]> {
    const filter: MemoryQueryFilter = {
      type: 'experience-record',
      ...(projectId && { projectId }),
    };
    const records = await this.ltm.query(filter);
    const expRecords = records
      .filter((r): r is ExperienceRecord => r.type === 'experience-record')
      .map((r) => ExperienceRecordSchema.parse(r));
    return identifyClusters(
      expRecords,
      this.config.clusterConfig ?? DEFAULT_DISTILLATION_CLUSTER_CONFIG,
    );
  }

  async distill(cluster: ExperienceCluster): Promise<DistilledPattern> {
    const records = cluster.records;
    const confidence = computeInitialConfidence(
      records,
      this.config.confidenceConfig ?? DEFAULT_CONFIDENCE_LIFECYCLE,
    );

    const basedOn = records.map((r) => r.id).sort();
    const supersedes = [...basedOn];

    const content = records
      .map((r) => `${r.context} → ${r.outcome}: ${r.reason}`)
      .join('; ');

    const pattern = DistilledPatternSchema.parse({
      id: generateId(),
      content,
      type: 'distilled-pattern',
      scope: 'project',
      projectId: cluster.projectId,
      confidence,
      sensitivity: [...new Set(records.flatMap((r) => r.sensitivity ?? []))],
      retention: 'permanent',
      provenance: {
        traceId: generateId(),
        source: 'distillation',
        timestamp: nowIso(),
      },
      tags: [...new Set(records.flatMap((r) => r.tags))],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      basedOn,
      supersedes,
      evidenceRefs: [{ actionCategory: 'memory-write' }],
    });

    return pattern;
  }

  async runDistillationPass(projectId?: ProjectId): Promise<DistillationResult> {
    const clusters = await this.identifyClusters(projectId);
    const patternsCreated: DistilledPattern[] = [];
    const recordsSuperseded: MemoryEntryId[] = [];

    for (const cluster of clusters) {
      const pattern = await this.distill(cluster);
      await this.ltm.write(pattern);
      await this.ltm.markSuperseded(
        cluster.records.map((r) => r.id),
        pattern.id,
      );
      patternsCreated.push(pattern);
      recordsSuperseded.push(...cluster.records.map((r) => r.id));
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
    return doUpdateConfidence(
      this.ltm,
      input,
      this.config.confidenceConfig ?? DEFAULT_CONFIDENCE_LIFECYCLE,
    );
  }

  async reverseSupersession(request: SupersessionReversalRequest): Promise<void> {
    return doReverseSupersession(this.ltm, request);
  }
}
