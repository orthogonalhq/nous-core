import { createHash, randomUUID } from 'node:crypto';
import type {
  DistilledPattern,
  IEmbedder,
  IDocumentStore,
  IKnowledgeIndex,
  IMemoryAccessPolicyEngine,
  IProjectStore,
  ProjectControlState,
  ProjectDiscoveryRequest,
  ProjectDiscoveryResult,
  ProjectId,
  ProjectKnowledgeRefreshRecord,
  ProjectKnowledgeRefreshRequest,
  ProjectKnowledgeSnapshot,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  DistilledPatternSchema,
  Phase8DiscoveryExportSchema,
  ProjectDiscoveryPolicySummarySchema,
  ProjectDiscoveryRequestSchema,
  ProjectDiscoveryResultSchema,
  ProjectKnowledgeRefreshRecordSchema,
  ProjectKnowledgeRefreshRequestSchema,
  ProjectKnowledgeSnapshotSchema,
} from '@nous/shared';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import type { IDiscoveryOrchestrator } from './discovery/discovery-orchestrator.js';
import { DiscoveryOrchestrator } from './discovery/discovery-orchestrator.js';
import { KnowledgeRefreshStore } from './knowledge-refresh-store.js';
import type { IMetaVectorStore } from './meta-vectors/meta-vector-store.js';
import { MetaVectorService } from './meta-vectors/meta-vector-service.js';
import type { IRelationshipExtractor } from './relationships/relationship-extractor.js';
import { StubRelationshipExtractor } from './relationships/relationship-extractor.js';
import { RelationshipMappingService } from './relationships/relationship-mapping-service.js';
import type { IRelationshipGraphStore } from './relationships/relationship-graph-store.js';
import type { IProjectTaxonomyMapping } from './taxonomy/project-taxonomy-mapping.js';

const MEMORY_ENTRY_COLLECTION = 'memory_entries';

type RefreshInFlightState = {
  startedAt: string;
  inputDigest?: string;
};

export interface KnowledgeIndexRuntimeDeps {
  documentStore: IDocumentStore;
  projectStore: IProjectStore;
  metaVectorStore: IMetaVectorStore;
  taxonomyMapping: IProjectTaxonomyMapping;
  relationshipGraphStore: IRelationshipGraphStore;
  embedder: IEmbedder;
  relationshipExtractor?: IRelationshipExtractor;
  accessPolicyEngine?: IMemoryAccessPolicyEngine;
  getProjectControlState?: (projectId: ProjectId) => Promise<ProjectControlState | undefined>;
  now?: () => Date;
  refreshStore?: KnowledgeRefreshStore;
  discoveryOrchestrator?: IDiscoveryOrchestrator;
}

const CONTROL_STATE_REASON_CODES: Record<string, string[]> = {
  hard_stopped: ['CGR-DENY-HARD-STOPPED'],
  paused_review: ['CGR-DEFER-PAUSED-REVIEW'],
  resuming: ['CGR-DEFER-RESUMING'],
};

export class KnowledgeIndexRuntime implements IKnowledgeIndex {
  private readonly now: () => Date;
  private readonly refreshStore: KnowledgeRefreshStore;
  private readonly metaVectorService: MetaVectorService;
  private readonly relationshipMappingService: RelationshipMappingService;
  private readonly discoveryOrchestrator: IDiscoveryOrchestrator;
  private readonly accessPolicyEngine: IMemoryAccessPolicyEngine;
  private readonly refreshLocks = new Map<string, Promise<ProjectKnowledgeRefreshRecord>>();
  private readonly refreshInFlight = new Map<string, RefreshInFlightState>();

  constructor(private readonly deps: KnowledgeIndexRuntimeDeps) {
    this.now = deps.now ?? (() => new Date());
    this.refreshStore = deps.refreshStore ?? new KnowledgeRefreshStore(deps.documentStore);
    this.metaVectorService = new MetaVectorService({
      store: deps.metaVectorStore,
      embedder: deps.embedder,
    });
    this.relationshipMappingService = new RelationshipMappingService({
      graphStore: deps.relationshipGraphStore,
      extractor: deps.relationshipExtractor ?? new StubRelationshipExtractor(),
    });
    this.discoveryOrchestrator =
      deps.discoveryOrchestrator ??
      new DiscoveryOrchestrator({
        metaVectorStore: deps.metaVectorStore,
        taxonomyMapping: deps.taxonomyMapping,
        relationshipGraphStore: deps.relationshipGraphStore,
      });
    this.accessPolicyEngine =
      deps.accessPolicyEngine ?? new MemoryAccessPolicyEngine();
  }

  async refreshProjectKnowledge(
    request: ProjectKnowledgeRefreshRequest,
  ): Promise<ProjectKnowledgeRefreshRecord> {
    const parsed = ProjectKnowledgeRefreshRequestSchema.parse(request);
    const key = String(parsed.projectId);
    const previous = this.refreshLocks.get(key);
    const run = (previous
      ? previous.catch(() => null)
      : Promise.resolve(null)).then(() => this.runRefresh(parsed));

    this.refreshLocks.set(key, run);

    try {
      return await run;
    } finally {
      if (this.refreshLocks.get(key) === run) {
        this.refreshLocks.delete(key);
      }
    }
  }

  async getProjectSnapshot(
    projectId: ProjectId,
  ): Promise<ProjectKnowledgeSnapshot | null> {
    const [metaVector, taxonomy, outgoing, incoming, latestRefresh] = await Promise.all([
      this.deps.metaVectorStore.get(projectId),
      this.deps.taxonomyMapping.getAssignmentsForProject(projectId),
      this.deps.relationshipGraphStore.getEdges(projectId),
      this.deps.relationshipGraphStore.getIncomingEdges(projectId),
      this.refreshStore.getLatestForProject(projectId),
    ]);

    const controlState = this.deps.getProjectControlState
      ? await this.deps.getProjectControlState(projectId)
      : undefined;
    const inFlight = this.refreshInFlight.get(String(projectId));

    if (
      metaVector == null &&
      taxonomy.length === 0 &&
      outgoing.length === 0 &&
      incoming.length === 0 &&
      latestRefresh == null &&
      !inFlight
    ) {
      return null;
    }

    return ProjectKnowledgeSnapshotSchema.parse({
      projectId,
      metaVector,
      taxonomy,
      relationships: {
        projectId,
        outgoing,
        incoming,
      },
      latestRefresh,
      diagnostics: {
        runtimePosture: 'single_process_local',
        refreshInFlight: inFlight != null,
        lastInputDigest: inFlight?.inputDigest ?? latestRefresh?.inputDigest,
        confidenceReasonCodes:
          controlState != null ? CONTROL_STATE_REASON_CODES[controlState] ?? [] : [],
      },
    });
  }

  async discoverProjects(
    request: ProjectDiscoveryRequest,
  ): Promise<ProjectDiscoveryResult> {
    const parsed = ProjectDiscoveryRequestSchema.parse(request);
    const queryVector = await this.deps.embedder.embed(parsed.query);
    const rawDiscovery = await this.discoveryOrchestrator.discoverRelevantProjects({
      queryVector,
      topK: parsed.topK,
      requestingProjectId: parsed.requestingProjectId,
      includeMetaVector: parsed.includeMetaVector,
      includeTaxonomy: parsed.includeTaxonomy,
      includeRelationships: parsed.includeRelationships,
    });

    const requestingProject = await this.deps.projectStore.get(parsed.requestingProjectId);
    const controlState = this.deps.getProjectControlState
      ? await this.deps.getProjectControlState(parsed.requestingProjectId)
      : undefined;
    const deniedReasonCodes: string[] = [];
    const allowedProjectIds: ProjectId[] = [];
    const allowedResults: typeof rawDiscovery.results = [];
    const explainabilityByProject = new Map(
      (rawDiscovery.explainability ?? []).map((item) => [item.projectId, item]),
    );

    if (requestingProject) {
      for (const result of rawDiscovery.results) {
        const targetProject = await this.deps.projectStore.get(result.projectId);
        if (!targetProject) {
          deniedReasonCodes.push('POL-DENIED');
          continue;
        }

        const policy = this.accessPolicyEngine.evaluate({
          action: 'retrieve',
          fromProjectId: parsed.requestingProjectId,
          projectPolicy: requestingProject.memoryAccessPolicy,
          targetProjectId: targetProject.id,
          targetProjectPolicy: targetProject.memoryAccessPolicy,
          includeGlobal: false,
          projectControlState: controlState,
          traceId: parsed.traceId,
        });

        if (!policy.allowed) {
          deniedReasonCodes.push(policy.reasonCode);
          continue;
        }

        allowedProjectIds.push(result.projectId);
        allowedResults.push({
          ...result,
          rank: allowedResults.length + 1,
        });
      }
    }

    const explainability = allowedProjectIds
      .map((projectId, index) => {
        const item = explainabilityByProject.get(projectId);
        if (!item) {
          return null;
        }
        return {
          ...item,
          resultIndex: index,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const discovery = Phase8DiscoveryExportSchema.parse({
      version: '1.0',
      exportedAt: this.now().toISOString(),
      requestingProjectId: parsed.requestingProjectId,
      projectIds: allowedProjectIds,
      results: allowedResults,
      audit: {
        ...rawDiscovery.audit,
        traceId: parsed.traceId ?? rawDiscovery.audit.traceId,
        projectIdsDiscovered: allowedProjectIds,
      },
      explainability,
    });

    const snapshot = await this.getProjectSnapshot(parsed.requestingProjectId);
    const policy = ProjectDiscoveryPolicySummarySchema.parse({
      deniedProjectCount: rawDiscovery.projectIds.length - allowedProjectIds.length,
      reasonCodes: [...new Set(deniedReasonCodes)],
      controlState,
    });

    return ProjectDiscoveryResultSchema.parse({
      discovery,
      policy,
      snapshot,
    });
  }

  private async runRefresh(
    request: ProjectKnowledgeRefreshRequest,
  ): Promise<ProjectKnowledgeRefreshRecord> {
    const startedAt = this.now().toISOString();
    const patterns = await this.loadPatterns(request.projectId);
    const inputDigest = computePatternDigest(patterns);
    this.refreshInFlight.set(String(request.projectId), {
      startedAt,
      inputDigest,
    });

    try {
      const latestRefresh = await this.refreshStore.getLatestForProject(request.projectId);
      if (
        latestRefresh &&
        latestRefresh.inputDigest === inputDigest &&
        latestRefresh.outcome !== 'failed'
      ) {
        const record = ProjectKnowledgeRefreshRecordSchema.parse({
          id: randomUUID(),
          projectId: request.projectId,
          trigger: request.trigger,
          reasonCode: request.reasonCode,
          inputDigest,
          outcome: 'skipped_no_change',
          metaVectorState: 'unchanged',
          taxonomyTagCount: latestRefresh.taxonomyTagCount,
          relationship: {
            projectId: request.projectId,
            edgesCreated: 0,
            edgesUpdated: 0,
            edgesInvalidated: 0,
            evidenceRefs: [],
          },
          evidenceRefs: flattenEvidenceRefs(patterns),
          workflowRunId: request.workflowRunId,
          dispatchLineageId: request.dispatchLineageId,
          scheduleId: request.scheduleId,
          sourcePatternIds: patterns.map((pattern) => pattern.id),
          startedAt,
          completedAt: this.now().toISOString(),
        });
        return this.refreshStore.append(record);
      }

      const refreshRecordId = randomUUID();
      const evidenceRefs = flattenEvidenceRefs(patterns);
      let outcome: ProjectKnowledgeRefreshRecord['outcome'] = 'updated';
      let metaVectorState: ProjectKnowledgeRefreshRecord['metaVectorState'] = 'unchanged';
      let relationship = {
        projectId: request.projectId,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesInvalidated: 0,
        evidenceRefs,
      };
      let taxonomyTagCount = 0;

      if (patterns.length === 0) {
        const [existingMetaVector, existingAssignments] = await Promise.all([
          this.deps.metaVectorStore.get(request.projectId),
          this.deps.taxonomyMapping.getAssignmentsForProject(request.projectId),
        ]);
        const invalidated = await this.deps.relationshipGraphStore.replaceEdgesForSource(
          request.projectId,
          [],
        );
        await this.deps.taxonomyMapping.replaceAssignments(request.projectId, []);
        if (existingMetaVector) {
          await this.deps.metaVectorStore.delete(request.projectId);
          metaVectorState = 'deleted';
        }
        outcome =
          existingMetaVector != null ||
          existingAssignments.length > 0 ||
          invalidated.invalidated > 0
            ? 'cleared'
            : 'skipped_no_change';
        relationship = {
          projectId: request.projectId,
          edgesCreated: 0,
          edgesUpdated: 0,
          edgesInvalidated: invalidated.invalidated,
          evidenceRefs,
        };
      } else {
        relationship = await this.relationshipMappingService.evaluateFromPatterns(
          request.projectId,
          patterns,
        );
        const assignments = buildTaxonomyAssignments({
          projectId: request.projectId,
          refreshRecordId,
          patterns,
          evidenceRefs,
          timestamp: startedAt,
        });
        taxonomyTagCount = assignments.length;
        await this.deps.taxonomyMapping.replaceAssignments(
          request.projectId,
          assignments,
        );
        const metaVector = await this.metaVectorService.refreshFromPatterns(
          request.projectId,
          patterns,
          {
            inputDigest,
            refreshRecordId,
            evidenceRefs,
            now: startedAt,
          },
        );
        metaVectorState = metaVector.state;
      }

      const record = ProjectKnowledgeRefreshRecordSchema.parse({
        id: refreshRecordId,
        projectId: request.projectId,
        trigger: request.trigger,
        reasonCode: request.reasonCode,
        inputDigest,
        outcome,
        metaVectorState,
        taxonomyTagCount,
        relationship,
        evidenceRefs,
        workflowRunId: request.workflowRunId,
        dispatchLineageId: request.dispatchLineageId,
        scheduleId: request.scheduleId,
        sourcePatternIds: patterns.map((pattern) => pattern.id),
        startedAt,
        completedAt: this.now().toISOString(),
      });

      return this.refreshStore.append(record);
    } catch (error) {
      const failure = ProjectKnowledgeRefreshRecordSchema.parse({
        id: randomUUID(),
        projectId: request.projectId,
        trigger: request.trigger,
        reasonCode: request.reasonCode,
        inputDigest,
        outcome: 'failed',
        metaVectorState: 'unchanged',
        taxonomyTagCount: 0,
        relationship: {
          projectId: request.projectId,
          edgesCreated: 0,
          edgesUpdated: 0,
          edgesInvalidated: 0,
          evidenceRefs: [],
        },
        evidenceRefs: flattenEvidenceRefs(patterns),
        workflowRunId: request.workflowRunId,
        dispatchLineageId: request.dispatchLineageId,
        scheduleId: request.scheduleId,
        sourcePatternIds: patterns.map((pattern) => pattern.id),
        failureReason: error instanceof Error ? error.message : String(error),
        startedAt,
        completedAt: this.now().toISOString(),
      });
      await this.refreshStore.append(failure);
      return failure;
    } finally {
      this.refreshInFlight.delete(String(request.projectId));
    }
  }

  private async loadPatterns(projectId: ProjectId): Promise<DistilledPattern[]> {
    const raw = await this.deps.documentStore.query<unknown>(MEMORY_ENTRY_COLLECTION, {
      where: {
        projectId,
        type: 'distilled-pattern',
      },
    });

    return raw
      .map((value) => DistilledPatternSchema.safeParse(value))
      .filter((parsed): parsed is { success: true; data: DistilledPattern } => parsed.success)
      .map((parsed) => parsed.data)
      .filter((pattern) => pattern.lifecycleStatus === 'active')
      .sort((left, right) => {
        if (left.updatedAt === right.updatedAt) {
          return left.id.localeCompare(right.id);
        }
        return left.updatedAt.localeCompare(right.updatedAt);
      });
  }
}

function buildTaxonomyAssignments(input: {
  projectId: ProjectId;
  refreshRecordId: string;
  patterns: DistilledPattern[];
  evidenceRefs: TraceEvidenceReference[];
  timestamp: string;
}) {
  const tags = [...new Set(input.patterns.flatMap((pattern) => pattern.tags))].sort();
  return tags.map((tag) => ({
    id: `${input.projectId}:${tag}`,
    projectId: input.projectId,
    tag,
    refreshRecordId: input.refreshRecordId,
    evidenceRefs: input.evidenceRefs,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }));
}

function computePatternDigest(patterns: DistilledPattern[]): string {
  const hash = createHash('sha256');
  const canonical = patterns.map((pattern) => ({
    id: pattern.id,
    content: pattern.content,
    confidence: pattern.confidence,
    basedOn: pattern.basedOn,
    supersedes: pattern.supersedes,
    tags: [...pattern.tags].sort(),
    evidenceRefs: pattern.evidenceRefs,
    createdAt: pattern.createdAt,
    updatedAt: pattern.updatedAt,
  }));
  hash.update(JSON.stringify(canonical));
  return hash.digest('hex');
}

function flattenEvidenceRefs(
  patterns: DistilledPattern[],
): TraceEvidenceReference[] {
  const seen = new Set<string>();
  const evidenceRefs: TraceEvidenceReference[] = [];
  for (const pattern of patterns) {
    for (const ref of pattern.evidenceRefs) {
      const key = JSON.stringify(ref);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      evidenceRefs.push(ref);
    }
  }
  return evidenceRefs;
}
