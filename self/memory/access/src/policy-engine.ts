/**
 * @nous/memory-access — Cross-project memory policy decision engine.
 *
 * Phase 3.2: Deterministic policy evaluation for read, write, retrieve.
 * Evaluation order: control-state gate → node override validation → effective policy → access check.
 */
import { randomUUID } from 'node:crypto';
import type {
  PolicyAccessContext,
  PolicyEvaluationResult,
  PolicyDecisionRecord,
  MemoryAccessPolicy,
  NodeMemoryAccessPolicyOverride,
  AccessList,
  ProjectId,
} from '@nous/shared';
import {
  PolicyAccessContextSchema,
  PolicyReasonCodeSchema,
  ProjectIdSchema,
  POLICY_REASON_CODES,
} from '@nous/shared';

/** Check if override is more restrictive than project policy. Override can only narrow access. */
function isMoreRestrictive(
  projectPolicy: MemoryAccessPolicy,
  override: NodeMemoryAccessPolicyOverride
): boolean {
  if (override.canReadFrom !== undefined) {
    if (!isAccessListMoreRestrictive(projectPolicy.canReadFrom, override.canReadFrom)) {
      return false;
    }
  }
  if (override.canBeReadBy !== undefined) {
    if (!isAccessListMoreRestrictive(projectPolicy.canBeReadBy, override.canBeReadBy)) {
      return false;
    }
  }
  if (override.inheritsGlobal !== undefined) {
    if (override.inheritsGlobal === true && projectPolicy.inheritsGlobal === false) {
      return false; // override cannot relax inheritsGlobal
    }
  }
  return true;
}

/** Override value must be more restrictive than project value. */
function isAccessListMoreRestrictive(
  project: AccessList,
  override: AccessList
): boolean {
  if (project === 'none') return override === 'none'; // cannot relax
  if (project === 'all') return true; // override can be 'none' or list
  // project is list
  if (override === 'all') return false; // list is more restrictive than all
  if (override === 'none') return true; // none is more restrictive than list
  // both are lists
  const projectSet = new Set(project);
  return override.every((id) => projectSet.has(id)) && override.length <= project.length;
}

/** Merge project policy with node override. Override wins for specified fields. */
function mergePolicy(
  projectPolicy: MemoryAccessPolicy,
  override: NodeMemoryAccessPolicyOverride
): MemoryAccessPolicy {
  return {
    canReadFrom: override.canReadFrom ?? projectPolicy.canReadFrom,
    canBeReadBy: override.canBeReadBy ?? projectPolicy.canBeReadBy,
    inheritsGlobal: override.inheritsGlobal ?? projectPolicy.inheritsGlobal,
  };
}

/** Check if fromProject can read from targetProject per policy. */
function canReadFrom(
  fromPolicy: MemoryAccessPolicy,
  targetProjectId: ProjectId | string,
  _fromProjectId: ProjectId | string
): boolean {
  if (fromPolicy.canReadFrom === 'none') return false;
  if (fromPolicy.canReadFrom === 'all') return true;
  return fromPolicy.canReadFrom.includes(targetProjectId as ProjectId);
}

/** Check if targetProject allows fromProject to read it. */
function canBeReadBy(
  targetPolicy: MemoryAccessPolicy,
  fromProjectId: ProjectId | string,
  _targetProjectId: ProjectId | string
): boolean {
  if (targetPolicy.canBeReadBy === 'none') return false;
  if (targetPolicy.canBeReadBy === 'all') return true;
  return targetPolicy.canBeReadBy.includes(fromProjectId as ProjectId);
}

/** Create a decision record. */
function createDecisionRecord(
  ctx: PolicyAccessContext,
  allowed: boolean,
  reasonCode: string,
  reason: string,
  targetProjectId?: ProjectId | string
): PolicyDecisionRecord {
  const outcome = allowed ? 'allowed' : 'denied';
  const resolvedTarget =
    targetProjectId != null
      ? typeof targetProjectId === 'string'
        ? ProjectIdSchema.parse(targetProjectId)
        : targetProjectId
      : ctx.targetProjectId;
  return {
    id: randomUUID(),
    projectId: ctx.fromProjectId,
    targetProjectId: resolvedTarget,
    action: ctx.action,
    outcome,
    reasonCode: PolicyReasonCodeSchema.parse(reasonCode),
    reason,
    nodeId: ctx.nodeId,
    traceId: ctx.traceId,
    evidenceRefs: [],
    occurredAt: new Date().toISOString(),
  };
}

/** Validate action-specific required fields. Throws if invalid. */
function validateActionContext(ctx: PolicyAccessContext): void {
  if (ctx.action === 'read' || ctx.action === 'write') {
    if (
      ctx.action === 'write' &&
      ctx.includeGlobal &&
      ctx.targetProjectId === undefined &&
      ctx.targetProjectPolicy === undefined
    ) {
      return;
    }
    if (ctx.targetProjectId === undefined || ctx.targetProjectId === '') {
      throw new Error(
        `PolicyAccessContext: action ${ctx.action} requires targetProjectId`
      );
    }
    if (ctx.targetProjectPolicy === undefined) {
      throw new Error(
        `PolicyAccessContext: action ${ctx.action} requires targetProjectPolicy`
      );
    }
  }
  if (ctx.action === 'retrieve') {
    const hasSingleTarget =
      ctx.targetProjectId !== undefined &&
      ctx.targetProjectPolicy !== undefined;
    const hasMultiTarget =
      ctx.targetProjectIds !== undefined &&
      ctx.targetProjectIds.length > 0 &&
      ctx.targetProjectPolicies !== undefined;
    const hasGlobalOnly = ctx.includeGlobal && !hasSingleTarget && !hasMultiTarget;
    if (!hasSingleTarget && !hasMultiTarget && !hasGlobalOnly) {
      throw new Error(
        'PolicyAccessContext: action retrieve requires (targetProjectId + targetProjectPolicy) or (targetProjectIds + targetProjectPolicies) or includeGlobal=true'
      );
    }
  }
}

/** MemoryAccessPolicyEngine — deterministic policy evaluation. */
export class MemoryAccessPolicyEngine {
  /** Evaluate policy for a cross-project memory operation. */
  evaluate(ctx: PolicyAccessContext): PolicyEvaluationResult {
    const parsed = PolicyAccessContextSchema.parse(ctx);
    validateActionContext(parsed);

    // 1. Project control-state gate
    if (parsed.projectControlState === 'hard_stopped') {
      const record = createDecisionRecord(
        parsed,
        false,
        'POL-CONTROL-STATE-BLOCKED',
        POLICY_REASON_CODES['POL-CONTROL-STATE-BLOCKED']
      );
      return {
        allowed: false,
        reasonCode: 'POL-CONTROL-STATE-BLOCKED',
        reason: POLICY_REASON_CODES['POL-CONTROL-STATE-BLOCKED'],
        decisionRecord: record,
      };
    }

    // 2. Node override validation
    if (parsed.nodeOverride) {
      if (!isMoreRestrictive(parsed.projectPolicy, parsed.nodeOverride)) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-INVALID-OVERRIDE',
          POLICY_REASON_CODES['POL-INVALID-OVERRIDE']
        );
        return {
          allowed: false,
          reasonCode: 'POL-INVALID-OVERRIDE',
          reason: POLICY_REASON_CODES['POL-INVALID-OVERRIDE'],
          decisionRecord: record,
        };
      }
    }

    const effectivePolicy = parsed.nodeOverride
      ? mergePolicy(parsed.projectPolicy, parsed.nodeOverride)
      : parsed.projectPolicy;

    // 3. Read evaluation
    if (parsed.action === 'read') {
      const targetId = parsed.targetProjectId!;
      const targetPolicy = parsed.targetProjectPolicy!;

      if (!canReadFrom(effectivePolicy, targetId, parsed.fromProjectId)) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-CANNOT-READ-FROM',
          POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
          targetId
        );
        return {
          allowed: false,
          reasonCode: 'POL-CANNOT-READ-FROM',
          reason: POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
          decisionRecord: record,
        };
      }
      if (!canBeReadBy(targetPolicy, parsed.fromProjectId, targetId)) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-CANNOT-BE-READ-BY',
          POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
          targetId
        );
        return {
          allowed: false,
          reasonCode: 'POL-CANNOT-BE-READ-BY',
          reason: POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
          decisionRecord: record,
        };
      }

      const reasonCode = parsed.nodeOverride ? 'POL-NODE-OVERRIDE' : 'POL-DEFAULT';
      const record = createDecisionRecord(
        parsed,
        true,
        reasonCode,
        POLICY_REASON_CODES[reasonCode],
        targetId
      );
      return {
        allowed: true,
        reasonCode,
        reason: POLICY_REASON_CODES[reasonCode],
        decisionRecord: record,
      };
    }

    // 4. Write evaluation (same as read per memory-system)
    if (parsed.action === 'write') {
      if (parsed.includeGlobal && parsed.targetProjectId == null) {
        if (!effectivePolicy.inheritsGlobal) {
          const record = createDecisionRecord(
            parsed,
            false,
            'POL-GLOBAL-DENIED',
            POLICY_REASON_CODES['POL-GLOBAL-DENIED']
          );
          return {
            allowed: false,
            reasonCode: 'POL-GLOBAL-DENIED',
            reason: POLICY_REASON_CODES['POL-GLOBAL-DENIED'],
            decisionRecord: record,
          };
        }

        const reasonCode = parsed.nodeOverride ? 'POL-NODE-OVERRIDE' : 'POL-DEFAULT';
        const record = createDecisionRecord(
          parsed,
          true,
          reasonCode,
          POLICY_REASON_CODES[reasonCode]
        );
        return {
          allowed: true,
          reasonCode,
          reason: POLICY_REASON_CODES[reasonCode],
          decisionRecord: record,
        };
      }

      const targetId = parsed.targetProjectId!;
      const targetPolicy = parsed.targetProjectPolicy!;

      if (!canReadFrom(effectivePolicy, targetId, parsed.fromProjectId)) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-CANNOT-READ-FROM',
          POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
          targetId
        );
        return {
          allowed: false,
          reasonCode: 'POL-CANNOT-READ-FROM',
          reason: POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
          decisionRecord: record,
        };
      }
      if (!canBeReadBy(targetPolicy, parsed.fromProjectId, targetId)) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-CANNOT-BE-READ-BY',
          POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
          targetId
        );
        return {
          allowed: false,
          reasonCode: 'POL-CANNOT-BE-READ-BY',
          reason: POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
          decisionRecord: record,
        };
      }

      const reasonCode = parsed.nodeOverride ? 'POL-NODE-OVERRIDE' : 'POL-DEFAULT';
      const record = createDecisionRecord(
        parsed,
        true,
        reasonCode,
        POLICY_REASON_CODES[reasonCode],
        targetId
      );
      return {
        allowed: true,
        reasonCode,
        reason: POLICY_REASON_CODES[reasonCode],
        decisionRecord: record,
      };
    }

    // 5. Retrieve evaluation
    if (parsed.action === 'retrieve') {
      // Check each target project
      const targets = parsed.targetProjectIds ?? (parsed.targetProjectId ? [parsed.targetProjectId] : []);
      const policies = parsed.targetProjectPolicies ?? (parsed.targetProjectId && parsed.targetProjectPolicy
        ? { [parsed.targetProjectId]: parsed.targetProjectPolicy }
        : {});

      for (const targetId of targets) {
        const targetPolicy = policies[targetId];
        if (!targetPolicy) continue;

        if (!canReadFrom(effectivePolicy, targetId, parsed.fromProjectId)) {
          const record = createDecisionRecord(
            parsed,
            false,
            'POL-CANNOT-READ-FROM',
            POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
            targetId
          );
          return {
            allowed: false,
            reasonCode: 'POL-CANNOT-READ-FROM',
            reason: POLICY_REASON_CODES['POL-CANNOT-READ-FROM'],
            decisionRecord: record,
          };
        }
        if (!canBeReadBy(targetPolicy, parsed.fromProjectId, targetId)) {
          const record = createDecisionRecord(
            parsed,
            false,
            'POL-CANNOT-BE-READ-BY',
            POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
            targetId
          );
          return {
            allowed: false,
            reasonCode: 'POL-CANNOT-BE-READ-BY',
            reason: POLICY_REASON_CODES['POL-CANNOT-BE-READ-BY'],
            decisionRecord: record,
          };
        }
      }

      // Check global inheritance
      if (parsed.includeGlobal && !effectivePolicy.inheritsGlobal) {
        const record = createDecisionRecord(
          parsed,
          false,
          'POL-GLOBAL-DENIED',
          POLICY_REASON_CODES['POL-GLOBAL-DENIED']
        );
        return {
          allowed: false,
          reasonCode: 'POL-GLOBAL-DENIED',
          reason: POLICY_REASON_CODES['POL-GLOBAL-DENIED'],
          decisionRecord: record,
        };
      }

      const reasonCode = parsed.nodeOverride ? 'POL-NODE-OVERRIDE' : 'POL-DEFAULT';
      const record = createDecisionRecord(
        parsed,
        true,
        reasonCode,
        POLICY_REASON_CODES[reasonCode]
      );
      return {
        allowed: true,
        reasonCode,
        reason: POLICY_REASON_CODES[reasonCode],
        decisionRecord: record,
      };
    }

    // Unreachable
    const record = createDecisionRecord(
      parsed,
      false,
      'POL-DENIED',
      POLICY_REASON_CODES['POL-DENIED']
    );
    return {
      allowed: false,
      reasonCode: 'POL-DENIED',
      reason: POLICY_REASON_CODES['POL-DENIED'],
      decisionRecord: record,
    };
  }
}
