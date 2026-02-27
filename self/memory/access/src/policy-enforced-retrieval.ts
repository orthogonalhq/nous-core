/**
 * @nous/memory-access — Policy-enforced retrieval wrapper.
 *
 * Phase 3.3: Wraps IRetrievalEngine, evaluates policy before delegating.
 * Surfaces must supply includeGlobal: true in PolicyAccessContext when global scope is in scope.
 */
import type {
  IRetrievalEngine,
  IMemoryAccessPolicyEngine,
  IProjectStore,
  RetrievalQuery,
  RetrievalResponse,
  PolicyAccessContext,
  ProjectConfig,
  ProjectControlState,
  ProjectId,
} from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY } from '@nous/shared';

export interface PolicyEnforcedRetrievalEngineDeps {
  policyEngine: IMemoryAccessPolicyEngine;
  inner: IRetrievalEngine;
  projectStore: IProjectStore;
  getProjectControlState?: (projectId: ProjectId) => Promise<ProjectControlState | undefined>;
}

function getEffectivePolicy(config: ProjectConfig | null) {
  if (config == null) return null;
  return config.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY;
}

/**
 * Build PolicyAccessContext for retrieval. includeGlobal: true when query scope is global or undefined.
 */
function buildPolicyAccessContextForRetrieval(
  query: RetrievalQuery,
  fromProjectConfig: ProjectConfig | null,
  targetProjectConfigs: Map<string, ProjectConfig>,
  projectControlState?: ProjectControlState
): PolicyAccessContext | null {
  const projectPolicy = getEffectivePolicy(fromProjectConfig);
  if (projectPolicy == null) return null;

  const fromProjectId = query.projectId;
  if (fromProjectId == null) return null;

  const includeGlobal =
    query.scope === 'global' || query.scope === undefined;

  const targetProjectId = query.filters?.projectId;
  if (targetProjectId != null && targetProjectId !== fromProjectId) {
    const targetConfig = targetProjectConfigs.get(targetProjectId);
    const targetPolicy = getEffectivePolicy(targetConfig ?? null);
    if (targetPolicy == null) return null;

    return {
      action: 'retrieve',
      fromProjectId,
      targetProjectId: targetProjectId as ProjectId,
      targetProjectPolicy: targetPolicy,
      includeGlobal,
      projectPolicy,
      projectControlState,
    };
  }

  if (includeGlobal) {
    return {
      action: 'retrieve',
      fromProjectId,
      includeGlobal,
      projectPolicy,
      targetProjectIds: [],
      targetProjectPolicies: {},
      projectControlState,
    };
  }

  return {
    action: 'retrieve',
    fromProjectId,
    targetProjectId: fromProjectId,
    targetProjectPolicy: projectPolicy,
    includeGlobal: false,
    projectPolicy,
    projectControlState,
  };
}

/**
 * Check if a retrieval result entry is allowed per policy.
 * Same-project entries always allowed. Global entries require inheritsGlobal. Cross-project requires canReadFrom/canBeReadBy.
 */
function isResultAllowed(
  entryProjectId: ProjectId | undefined,
  entryScope: 'global' | 'project',
  fromProjectId: ProjectId,
  fromPolicy: { canReadFrom: string | string[]; canBeReadBy: string | string[]; inheritsGlobal: boolean },
  targetPolicy?: { canReadFrom: string | string[]; canBeReadBy: string | string[] } | null
): boolean {
  if (entryScope === 'global') {
    return fromPolicy.inheritsGlobal;
  }
  const targetId = entryProjectId ?? fromProjectId;
  if (targetId === fromProjectId) return true;

  if (!targetPolicy) return false;
  const canReadFrom =
    fromPolicy.canReadFrom === 'all' ||
    (Array.isArray(fromPolicy.canReadFrom) && fromPolicy.canReadFrom.includes(targetId));
  const canBeReadBy =
    targetPolicy.canBeReadBy === 'all' ||
    (Array.isArray(targetPolicy.canBeReadBy) && targetPolicy.canBeReadBy.includes(fromProjectId));
  return !!canReadFrom && !!canBeReadBy;
}

/**
 * Policy-enforced retrieval engine. Evaluates policy before delegating to inner engine;
 * filters results by policy when includeGlobal or cross-project scope.
 */
export class PolicyEnforcedRetrievalEngine implements IRetrievalEngine {
  constructor(private readonly deps: PolicyEnforcedRetrievalEngineDeps) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievalResponse> {
    const fromProjectId = query.projectId;
    if (fromProjectId == null) return { results: [] };

    const fromConfig = await this.deps.projectStore.get(fromProjectId);
    const projectPolicy = getEffectivePolicy(fromConfig);
    if (projectPolicy == null) return { results: [] };

    const targetProjectConfigs = new Map<string, ProjectConfig>();
    const targetProjectId = query.filters?.projectId;
    if (targetProjectId != null && targetProjectId !== fromProjectId) {
      const targetConfig = await this.deps.projectStore.get(targetProjectId as ProjectId);
      if (targetConfig == null) return { results: [] };
      targetProjectConfigs.set(targetProjectId, targetConfig);
    }

    const projectControlState = this.deps.getProjectControlState
      ? await this.deps.getProjectControlState(fromProjectId)
      : undefined;

    const policyCtx = buildPolicyAccessContextForRetrieval(
      query,
      fromConfig,
      targetProjectConfigs,
      projectControlState
    );

    if (policyCtx == null) return { results: [] };

    const policyResult = this.deps.policyEngine.evaluate(policyCtx);
    if (!policyResult.allowed) {
      return { results: [], policyDenial: policyResult.decisionRecord };
    }

    const response = await this.deps.inner.retrieve(query);
    const results = response.results;

    const policyByProject = new Map<string, { canReadFrom: string | string[]; canBeReadBy: string | string[] }>();
    for (const r of results) {
      const pid = r.entry.projectId;
      if (pid != null && pid !== fromProjectId && !policyByProject.has(pid)) {
        const cfg = targetProjectConfigs.get(pid) ?? (await this.deps.projectStore.get(pid as ProjectId));
        if (cfg) {
          policyByProject.set(pid, cfg.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY);
        }
      }
    }

    const filtered = results.filter((r) => {
      const targetId = r.entry.projectId;
      const targetPolicy =
        targetId != null && targetId !== fromProjectId
          ? policyByProject.get(targetId)
          : undefined;
      return isResultAllowed(
        r.entry.projectId,
        r.entry.scope,
        fromProjectId,
        projectPolicy,
        targetPolicy ?? undefined
      );
    });

    return { results: filtered };
  }
}
