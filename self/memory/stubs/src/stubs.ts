/**
 * Stub implementations for deferred memory interfaces.
 *
 * All methods throw NousError with code 'NOT_IMPLEMENTED'.
 * Real implementations arrive in Phase 2 (LTM, retrieval), Phase 3 (access policy),
 * Phase 4 (distillation), and Phase 6 (knowledge index).
 */
import { NousError } from '@nous/shared';
import type {
  ILtmStore,
  IDistillationEngine,
  IRetrievalEngine,
  IKnowledgeIndex,
  IAccessPolicy,
  ProjectId,
  MemoryEntryId,
  MemoryEntry,
  MemoryQueryFilter,
  MemoryAccessPolicy,
  ExperienceCluster,
  DistilledPattern,
  DistillationResult,
  RetrievalQuery,
  RetrievalResponse,
  ConfidenceUpdateResult,
  ProjectKnowledgeRefreshRequest,
  ProjectKnowledgeRefreshRecord,
  ProjectKnowledgeSnapshot,
  ProjectDiscoveryRequest,
  ProjectDiscoveryResult,
} from '@nous/shared';

const stubNotImpl = (
  interfaceName: string,
  method: string,
  targetPhase: string,
): never => {
  console.warn(`[nous:stub] ${interfaceName}.${method} called — not implemented`);
  throw new NousError(
    `${interfaceName}.${method}() is not implemented — real implementation in ${targetPhase}`,
    'NOT_IMPLEMENTED',
  );
};

export class StubLtmStore implements ILtmStore {
  async write(_entry: MemoryEntry): Promise<MemoryEntryId> {
    return stubNotImpl('ILtmStore', 'write', 'Phase 2');
  }

  async read(_id: MemoryEntryId): Promise<MemoryEntry | null> {
    return stubNotImpl('ILtmStore', 'read', 'Phase 2');
  }

  async query(_filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    return stubNotImpl('ILtmStore', 'query', 'Phase 2');
  }

  async delete(_id: MemoryEntryId): Promise<boolean> {
    return stubNotImpl('ILtmStore', 'delete', 'Phase 2');
  }

  async export(_filter: MemoryQueryFilter): Promise<MemoryEntry[]> {
    return stubNotImpl('ILtmStore', 'export', 'Phase 2');
  }

  async markSuperseded(
    _ids: MemoryEntryId[],
    _supersededBy: MemoryEntryId,
  ): Promise<void> {
    return stubNotImpl('ILtmStore', 'markSuperseded', 'Phase 2');
  }
}

export class StubDistillationEngine implements IDistillationEngine {
  async identifyClusters(
    _projectId?: ProjectId,
  ): Promise<ExperienceCluster[]> {
    return stubNotImpl('IDistillationEngine', 'identifyClusters', 'Phase 4');
  }

  async distill(_cluster: ExperienceCluster): Promise<DistilledPattern> {
    return stubNotImpl('IDistillationEngine', 'distill', 'Phase 4');
  }

  async runDistillationPass(
    _projectId?: ProjectId,
  ): Promise<DistillationResult> {
    return stubNotImpl('IDistillationEngine', 'runDistillationPass', 'Phase 4');
  }

  async updateConfidence(
    _input: Parameters<IDistillationEngine['updateConfidence']>[0],
  ): Promise<ConfidenceUpdateResult> {
    return stubNotImpl('IDistillationEngine', 'updateConfidence', 'Phase 4');
  }

  async reverseSupersession(
    _request: Parameters<IDistillationEngine['reverseSupersession']>[0],
  ): Promise<void> {
    return stubNotImpl('IDistillationEngine', 'reverseSupersession', 'Phase 4');
  }
}

export class StubRetrievalEngine implements IRetrievalEngine {
  async retrieve(_query: RetrievalQuery): Promise<RetrievalResponse> {
    return stubNotImpl('IRetrievalEngine', 'retrieve', 'Phase 2');
  }
}

export class StubKnowledgeIndex implements IKnowledgeIndex {
  async refreshProjectKnowledge(
    _request: ProjectKnowledgeRefreshRequest,
  ): Promise<ProjectKnowledgeRefreshRecord> {
    return stubNotImpl('IKnowledgeIndex', 'refreshProjectKnowledge', 'Phase 9');
  }

  async discoverProjects(
    _request: ProjectDiscoveryRequest,
  ): Promise<ProjectDiscoveryResult> {
    return stubNotImpl('IKnowledgeIndex', 'discoverProjects', 'Phase 9');
  }

  async getProjectSnapshot(
    _projectId: ProjectId,
  ): Promise<ProjectKnowledgeSnapshot | null> {
    return stubNotImpl('IKnowledgeIndex', 'getProjectSnapshot', 'Phase 9');
  }
}

export class StubAccessPolicy implements IAccessPolicy {
  async canRead(
    _sourceProjectId: ProjectId,
    _targetProjectId: ProjectId,
  ): Promise<boolean> {
    return stubNotImpl('IAccessPolicy', 'canRead', 'Phase 3');
  }

  async inheritsGlobal(_projectId: ProjectId): Promise<boolean> {
    return stubNotImpl('IAccessPolicy', 'inheritsGlobal', 'Phase 3');
  }

  async getPolicy(_projectId: ProjectId): Promise<MemoryAccessPolicy> {
    return stubNotImpl('IAccessPolicy', 'getPolicy', 'Phase 3');
  }
}
