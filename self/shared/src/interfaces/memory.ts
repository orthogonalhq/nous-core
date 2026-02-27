/**
 * Memory layer interface contracts.
 *
 * IStmStore, ILtmStore, IDistillationEngine, IRetrievalEngine,
 * IKnowledgeIndex, IAccessPolicy, IMemoryAccessPolicyEngine.
 */
import type {
  ProjectId,
  MemoryEntryId,
  MemoryEntry,
  MemoryQueryFilter,
  MemoryAccessPolicy,
  StmContext,
  StmEntry,
  ExperienceCluster,
  DistilledPattern,
  DistillationResult,
  RetrievalQuery,
  RetrievalResult,
  RetrievalResponse,
  PolicyAccessContext,
  PolicyEvaluationResult,
  ConfidenceRefreshInput,
  ConfidenceDecayInput,
  ConfidenceUpdateResult,
  SupersessionReversalRequest,
} from '../types/index.js';

export interface IStmStore {
  /** Get the current working context for a project */
  getContext(projectId: ProjectId): Promise<StmContext>;

  /** Append a new entry to the working context */
  append(projectId: ProjectId, entry: StmEntry): Promise<void>;

  /** Summarize and evict older context entries */
  compact(projectId: ProjectId): Promise<void>;

  /** Clear STM for a project */
  clear(projectId: ProjectId): Promise<void>;
}

export interface ILtmStore {
  /** Write a memory entry (already Cortex-approved) */
  write(entry: MemoryEntry): Promise<MemoryEntryId>;

  /** Read a specific memory entry by ID */
  read(id: MemoryEntryId): Promise<MemoryEntry | null>;

  /** Query memory entries by type, scope, project, tags */
  query(filter: MemoryQueryFilter): Promise<MemoryEntry[]>;

  /** Delete a specific memory entry */
  delete(id: MemoryEntryId): Promise<boolean>;

  /** Export memory entries matching a filter */
  export(filter: MemoryQueryFilter): Promise<MemoryEntry[]>;

  /** Mark entries as superseded (for distillation) */
  markSuperseded(ids: MemoryEntryId[], supersededBy: MemoryEntryId): Promise<void>;
}

export interface IDistillationEngine {
  /** Identify clusters of related experience records */
  identifyClusters(projectId?: ProjectId): Promise<ExperienceCluster[]>;

  /** Compress a cluster into a distilled pattern */
  distill(cluster: ExperienceCluster): Promise<DistilledPattern>;

  /** Run a full distillation pass */
  runDistillationPass(projectId?: ProjectId): Promise<DistillationResult>;

  /** Update pattern confidence (refresh on confirming signal, decay on staleness/contradiction). Phase 4.3. */
  updateConfidence(
    input: ConfidenceRefreshInput | ConfidenceDecayInput,
  ): Promise<ConfidenceUpdateResult>;

  /** Reverse supersession: restore source records to active, retire pattern. Phase 4.3. */
  reverseSupersession(request: SupersessionReversalRequest): Promise<void>;
}

export interface IRetrievalEngine {
  /** Retrieve relevant memories for the current situation */
  retrieve(query: RetrievalQuery): Promise<RetrievalResponse>;
}

export interface IKnowledgeIndex {
  /** Update meta-vector for a project */
  updateMetaVector(projectId: ProjectId): Promise<void>;

  /** Discover relevant projects for a query */
  discoverProjects(query: string, excludeProjectIds?: ProjectId[]): Promise<ProjectId[]>;
}

export interface IAccessPolicy {
  /** Check if sourceProject can read from targetProject */
  canRead(sourceProjectId: ProjectId, targetProjectId: ProjectId): Promise<boolean>;

  /** Check if a project inherits global memory */
  inheritsGlobal(projectId: ProjectId): Promise<boolean>;

  /** Get the full access policy for a project */
  getPolicy(projectId: ProjectId): Promise<MemoryAccessPolicy>;
}

/** Phase 3.2 — Deterministic policy decision engine for cross-project memory access */
export interface IMemoryAccessPolicyEngine {
  /** Evaluate policy for a cross-project memory operation. Synchronous for replay-determinism. */
  evaluate(ctx: PolicyAccessContext): PolicyEvaluationResult;
}
