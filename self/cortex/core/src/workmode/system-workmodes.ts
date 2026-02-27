/**
 * Canonical system workmode contracts.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Canonical source: work-operation-modes-architecture-v1.md
 */
import type { WorkmodeContract } from '@nous/shared';

export const SYSTEM_IMPLEMENTATION: WorkmodeContract = {
  workmode_id: 'system:implementation',
  entrypoint_ref: '@.skills/engineer-workflow-sop/implementation-agent/ENTRY.md',
  sop_ref: '@.skills/engineer-workflow-sop/SKILL.md',
  allowed_artifact_surfaces: ['.worklog/', 'self/', 'docs/', 'packages/', 'scripts/'],
  policy_group_compatibility: ['system'],
  version: '1.0',
};

export const SYSTEM_ARCHITECTURE: WorkmodeContract = {
  workmode_id: 'system:architecture',
  entrypoint_ref: '@.architecture/',
  sop_ref: '@.skills/engineer-workflow-sop/SKILL.md',
  allowed_artifact_surfaces: ['.architecture/'],
  policy_group_compatibility: ['system'],
  version: '1.0',
};

export const SYSTEM_SKILL_AUTHORING: WorkmodeContract = {
  workmode_id: 'system:skill_authoring',
  entrypoint_ref: '@.skills/',
  sop_ref: '@.skills/engineer-workflow-sop/SKILL.md',
  allowed_artifact_surfaces: ['.skills/'],
  policy_group_compatibility: ['system'],
  version: '1.0',
};

export const CANONICAL_SYSTEM_WORKMODES: WorkmodeContract[] = [
  SYSTEM_IMPLEMENTATION,
  SYSTEM_ARCHITECTURE,
  SYSTEM_SKILL_AUTHORING,
];
