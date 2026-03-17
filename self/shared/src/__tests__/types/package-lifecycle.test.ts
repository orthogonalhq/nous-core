import { describe, it, expect } from 'vitest';
import {
  PackageLifecycleEventBaseSchema,
  PackageLifecycleDecisionEventSchema,
  PackageLifecycleStateRecordSchema,
  PackageLifecycleTransitionRequestSchema,
  PackageLifecycleTransitionResultSchema,
  PackageUpdateStageSnapshotSchema,
} from '../../types/package-lifecycle.js';

const BASE_EVENT = {
  event_type: 'pkg_ingest_received',
  package_id: 'skill:image-quality-assessment',
  package_version: '1.2.0',
  origin_class: 'third_party_external',
  witness_ref: 'evt_123',
} as const;

describe('PackageLifecycleEventBaseSchema', () => {
  it('accepts valid lifecycle event payloads', () => {
    const result = PackageLifecycleEventBaseSchema.safeParse(BASE_EVENT);
    expect(result.success).toBe(true);
  });

  it('requires origin_class', () => {
    const { origin_class: _removed, ...event } = BASE_EVENT;
    const result = PackageLifecycleEventBaseSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('PackageLifecycleDecisionEventSchema', () => {
  it('requires reason_code for blocked runtime decisions', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_runtime_action_decided',
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason-coded blocked runtime decisions', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_runtime_action_decided',
      reason_code: 'PKG-002-CAPABILITY_REPLAY_DETECTED',
    });
    expect(result.success).toBe(true);
  });

  it('accepts reason-coded quarantined outcomes', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_quarantined',
      reason_code: 'PKG-001-REVOKED_SIGNER',
    });
    expect(result.success).toBe(true);
  });
});

describe('PackageLifecycleTransitionRequestSchema', () => {
  it('accepts valid transition requests', () => {
    const result = PackageLifecycleTransitionRequestSchema.safeParse({
      project_id: 'project-123',
      package_id: 'skill:image-quality-assessment',
      package_version: '1.2.0',
      origin_class: 'third_party_external',
      target_transition: 'install',
      actor_id: 'orchestrator',
      compatibility: {
        api_compatible: true,
      },
      capability: {
        expansion_requested: false,
        reapproval_granted: false,
      },
      registry_eligibility: {
        package_id: 'skill:image-quality-assessment',
        release_id: 'release-1',
        package_version: '1.2.0',
        trust_tier: 'verified_maintainer',
        distribution_status: 'active',
        compatibility_state: 'compatible',
        metadata_valid: true,
        signer_valid: true,
        requires_principal_override: false,
        block_reason_codes: [],
        evidence_refs: ['witness:evt_123'],
        evaluated_at: new Date().toISOString(),
      },
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageLifecycleTransitionResultSchema', () => {
  it('requires reason_code for blocked decisions', () => {
    const result = PackageLifecycleTransitionResultSchema.safeParse({
      decision: 'blocked',
      transition: 'install',
      from_state: 'ingested',
      to_state: 'ingested',
      witness_ref: 'evt_123',
      evidence_refs: ['event:pkg_capability_blocked'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason-coded blocked transition results', () => {
    const result = PackageLifecycleTransitionResultSchema.safeParse({
      decision: 'blocked',
      transition: 'install',
      from_state: 'ingested',
      to_state: 'ingested',
      reason_code: 'PKG-002-CAP_EXPANSION_PENDING',
      witness_ref: 'evt_123',
      evidence_refs: ['event:pkg_capability_blocked'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts registry-coded blocked transition results', () => {
    const result = PackageLifecycleTransitionResultSchema.safeParse({
      decision: 'blocked',
      transition: 'install',
      from_state: 'ingested',
      to_state: 'ingested',
      reason_code: 'MKT-002-UNREGISTERED_EXTERNAL',
      witness_ref: 'evt_123',
      evidence_refs: ['event:pkg_runtime_action_decided'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts package-resolution reason codes in blocked transition results', () => {
    const result = PackageLifecycleTransitionResultSchema.safeParse({
      decision: 'blocked',
      transition: 'install',
      from_state: 'ingested',
      to_state: 'ingested',
      reason_code: 'PKG-009-DEPENDENCY_RANGE_CONFLICT',
      witness_ref: 'evt_123',
      evidence_refs: ['event:pkg_runtime_action_decided'],
    });

    expect(result.success).toBe(true);
  });

  it('accepts runtime reason codes in blocked transition results', () => {
    const result = PackageLifecycleTransitionResultSchema.safeParse({
      decision: 'blocked',
      transition: 'run',
      from_state: 'enabled',
      to_state: 'enabled',
      reason_code: 'PKG-010-HANDSHAKE_TIMEOUT',
      witness_ref: 'evt_123',
      evidence_refs: ['event:pkg_runtime_action_decided'],
    });

    expect(result.success).toBe(true);
  });
});

describe('PackageLifecycleStateRecordSchema', () => {
  it('accepts valid lifecycle state records', () => {
    const result = PackageLifecycleStateRecordSchema.safeParse({
      project_id: 'project-123',
      package_id: 'skill:image-quality-assessment',
      package_version: '1.2.0',
      origin_class: 'self_created_local',
      current_state: 'enabled',
      previous_safe_version: '1.1.0',
      trust_scope: 'cross_instance_approved',
      last_reason_code: 'PKG-002-CAP_EXPANSION_PENDING',
      last_witness_ref: 'evt_123',
      version: 1,
      updated_at: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe('PackageUpdateStageSnapshotSchema', () => {
  it('requires checkpoint_ref for staged updates', () => {
    const result = PackageUpdateStageSnapshotSchema.safeParse({
      project_id: 'project-123',
      package_id: 'skill:image-quality-assessment',
      previous_safe_version: '1.1.0',
      candidate_version: '1.2.0',
      staged_at: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});

