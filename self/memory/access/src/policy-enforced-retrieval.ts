/**
 * @nous/memory-access — Policy-enforced retrieval wrapper.
 *
 * Phase 3.3: Wraps IRetrievalEngine, evaluates policy before delegating.
 * Phase 6.1: targetProjectIds for explicit cross-project scope; selection policy; selectionAudit.
 */
import type {
  IRetrievalEngine,
  IMemoryAccessPolicyEngine,
  IProjectStore,
  RetrievalQuery,
  RetrievalResponse,
  RetrievalResult,
  PolicyAccessContext,
  ProjectConfig,
  ProjectControlState,
  ProjectId,
  SelectionAudit,
  CrossProjectSelectionPolicy,
} from '@nous/shared';
import {
  DEFAULT_MEMORY_ACCESS_POLICY,
  DEFAULT_CROSS_PROJECT_SELECTION_POLICY,
} from '@nous/shared';

export interface PolicyEnforcedRetrievalEngineDeps {
  policyEngine: IMemoryAccessPolicyEngine;
  inner: IRetrievalEngine;
  projectStore: IProjectStore;
  getProjectControlState?: (projectId: ProjectId) => Promise<ProjectControlState | undefined>;
  /** Phase 6.1: Optional selection policy for cross-project queries. Default used when absent. */
  selectionPolicy?: CrossProjectSelectionPolicy;
}

function getEffectivePolicy(config: ProjectConfig | null) {
  if (config == null) return null;
  return config.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY;
}

/** ~4 chars per token heuristic for selection policy truncation. */
const TOKENS_PER_CHAR = 1 / 4;

function estimateTokens(content: string): number {
  return Math.ceil(content.length * TOKENS_PER_CHAR);
}

/**
 * Apply selection policy: result cap and token budget. Deterministic: score desc, tie-break by entry.id.
 */
function applySelectionPolicy(
  results: RetrievalResult[],
  policy: CrossProjectSelectionPolicy
): {
  results: RetrievalResult[];
  truncationReason: 'token_budget' | 'result_cap' | 'none';
} {
  const sorted = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.entry.id).localeCompare(String(b.entry.id));
  });

  let truncationReason: 'token_budget' | 'result_cap' | 'none' = 'none';
  let kept = sorted.slice(0, policy.resultCap);
  if (kept.length < sorted.length) truncationReason = 'result_cap';

  let consumed = 0;
  const final: RetrievalResult[] = [];
  for (const r of kept) {
    const tokens = estimateTokens(r.entry.content);
    if (consumed + tokens > policy.tokenBudget && final.length > 0) {
      truncationReason = truncationReason === 'none' ? 'token_budget' : truncationReason;
      break;
    }
    final.push(r);
    consumed += tokens;
  }
  if (final.length < kept.length && truncationReason === 'none')
    truncationReason = 'token_budget';

  return { results: final, truncationReason };
}

/**
 * Build PolicyAccessContext for retrieval. includeGlobal: true when query scope is global or undefined.
 * Phase 6.1: targetProjectIds for explicit multi-project cross-project retrieval.
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

  // Phase 6.1: Explicit targetProjectIds for cross-project retrieval
  const targetProjectIds = query.targetProjectIds;
  if (
    targetProjectIds != null &&
    targetProjectIds.length > 0
  ) {
    const targetProjectPolicies: Record<string, ReturnType<typeof getEffectivePolicy>> = {};
    for (const tid of targetProjectIds) {
      const cfg = targetProjectConfigs.get(tid);
      const pol = getEffectivePolicy(cfg ?? null);
      if (pol == null) return null; // Missing config → deny
      targetProjectPolicies[tid] = pol;
    }
    return {
      action: 'retrieve',
      fromProjectId,
      includeGlobal,
      projectPolicy,
      targetProjectIds,
      targetProjectPolicies: targetProjectPolicies as Record<
        string,
        NonNullable<ReturnType<typeof getEffectivePolicy>>
      >,
      projectControlState,
    };
  }

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
    // Phase 6.1: Load configs for explicit targetProjectIds
    const targetProjectIds = query.targetProjectIds;
    if (targetProjectIds != null && targetProjectIds.length > 0) {
      for (const tid of targetProjectIds) {
        const cfg = await this.deps.projectStore.get(tid);
        if (cfg == null) return { results: [] };
        targetProjectConfigs.set(tid, cfg);
      }
    } else {
      const targetProjectId = query.filters?.projectId;
      if (targetProjectId != null && targetProjectId !== fromProjectId) {
        const targetConfig = await this.deps.projectStore.get(targetProjectId as ProjectId);
        if (targetConfig == null) return { results: [] };
        targetProjectConfigs.set(targetProjectId, targetConfig);
      }
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

    // Phase 6.1: Apply selection policy and populate selectionAudit when targetProjectIds present
    const selectionPolicy =
      this.deps.selectionPolicy ?? DEFAULT_CROSS_PROJECT_SELECTION_POLICY;
    const projectIdsQueried =
      targetProjectIds != null && targetProjectIds.length > 0
        ? [fromProjectId, ...targetProjectIds]
        : [fromProjectId];

    if (targetProjectIds != null && targetProjectIds.length > 0) {
      const { results: truncated, truncationReason } = applySelectionPolicy(
        filtered,
        selectionPolicy
      );
      const selectionAudit: SelectionAudit = {
        projectIdsQueried,
        candidateCount: filtered.length,
        resultCount: truncated.length,
        truncationReason,
      };
      return { results: truncated, selectionAudit };
    }

    return { results: filtered };
  }
}
