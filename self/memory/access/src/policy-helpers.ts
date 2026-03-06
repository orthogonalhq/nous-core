/**
 * @nous/memory-access — Policy helpers for cross-project memory enforcement.
 *
 * Phase 3.3: Helpers for building PolicyAccessContext from operation context.
 */
import type {
  MemoryWriteCandidate,
  ProjectId,
  ProjectConfig,
  ProjectControlState,
  TraceId,
  NodeId,
  PolicyAccessContext,
  MemoryAccessPolicy,
} from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY } from '@nous/shared';

/** Returns true when policy evaluation is required before memory write. */
export function isCrossProjectMemoryWrite(
  candidate: MemoryWriteCandidate,
  actingProjectId: ProjectId | undefined
): boolean {
  if (candidate.scope === 'global') return true;
  if (
    candidate.projectId != null &&
    actingProjectId != null &&
    candidate.projectId !== actingProjectId
  ) {
    return true;
  }
  return false;
}

/** Effective policy from project config. Applies DEFAULT when absent. */
function getEffectivePolicy(config: ProjectConfig | null): MemoryAccessPolicy | null {
  if (config == null) return null;
  return config.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY;
}

export interface BuildPolicyContextForMemoryWriteParams {
  candidate: MemoryWriteCandidate;
  actingProjectId: ProjectId;
  actingProjectConfig: ProjectConfig | null;
  targetProjectConfig?: ProjectConfig | null;
  projectControlState?: ProjectControlState;
  traceId?: TraceId;
  nodeId?: NodeId;
}

/**
 * Build PolicyAccessContext for cross-project memory write evaluation.
 * Returns null when config is missing (fail-closed).
 */
export function buildPolicyAccessContextForMemoryWrite(
  params: BuildPolicyContextForMemoryWriteParams
): PolicyAccessContext | null {
  const {
    candidate,
    actingProjectId,
    actingProjectConfig,
    targetProjectConfig,
    projectControlState,
    traceId,
    nodeId,
  } = params;

  const projectPolicy = getEffectivePolicy(actingProjectConfig);
  if (projectPolicy == null) return null;

  if (candidate.scope === 'global') {
    return {
      action: 'write',
      fromProjectId: actingProjectId,
      includeGlobal: true,
      projectPolicy,
      projectControlState,
      traceId,
      nodeId,
    };
  }

  if (
    candidate.projectId != null &&
    candidate.projectId !== actingProjectId
  ) {
    const targetPolicy = getEffectivePolicy(targetProjectConfig ?? null);
    if (targetPolicy == null) return null;

    return {
      action: 'write',
      fromProjectId: actingProjectId,
      targetProjectId: candidate.projectId,
      targetProjectPolicy: targetPolicy,
      includeGlobal: false,
      projectPolicy,
      projectControlState,
      traceId,
      nodeId,
    };
  }

  return null;
}
