import { describe, expect, it } from 'vitest';
import {
  calculateCapabilityDelta,
  type PackageLifecycleTransitionRequest,
} from '@nous/shared';
import { PackageLifecycleOrchestrator } from '../package-lifecycle/orchestrator.js';

const BASE_REQUEST: Omit<
  PackageLifecycleTransitionRequest,
  'target_transition'
> = {
  project_id: 'project-int',
  package_id: 'project:persona-engine',
  package_version: '2.0.0',
  origin_class: 'nous_first_party',
  actor_id: 'orchestrator',
};

const buildRequest = (
  transition: PackageLifecycleTransitionRequest['target_transition'],
  overrides: Partial<PackageLifecycleTransitionRequest> = {},
): PackageLifecycleTransitionRequest => ({
  ...BASE_REQUEST,
  target_transition: transition,
  ...overrides,
});

describe('Package lifecycle integration flows', () => {
  it('enforces capability-delta reapproval during update stage and preserves evidence linkage', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      now: () => new Date('2026-03-02T00:00:00.000Z'),
    });

    await orchestrator.ingest(buildRequest('ingest'));
    await orchestrator.install(
      buildRequest('install', {
        admission: {
          signature_valid: true,
          signer_known: true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: false,
          reverification_complete: true,
          reapproval_complete: true,
        },
        compatibility: {
          api_compatible: true,
        },
      }),
    );
    await orchestrator.enable(
      buildRequest('enable', {
        admission: {
          signature_valid: true,
          signer_known: true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: false,
          reverification_complete: true,
          reapproval_complete: true,
        },
      }),
    );

    const delta = calculateCapabilityDelta(
      ['model.invoke'],
      ['model.invoke', 'tool.execute'],
    );
    expect(delta.requires_reapproval).toBe(true);

    const blockedStage = await orchestrator.stageUpdate(
      buildRequest('stage_update', {
        target_version: '2.1.0',
        checkpoint_ref: 'cp-100',
        capability: {
          expansion_requested: delta.requires_reapproval,
          reapproval_granted: false,
        },
      }),
    );
    expect(blockedStage.decision).toBe('blocked');
    expect(blockedStage.reason_code).toBe('PKG-002-CAP_EXPANSION_PENDING');

    const stage = await orchestrator.stageUpdate(
      buildRequest('stage_update', {
        target_version: '2.1.0',
        checkpoint_ref: 'cp-101',
        capability: {
          expansion_requested: delta.requires_reapproval,
          reapproval_granted: true,
        },
      }),
    );
    expect(stage.decision).toBe('allowed');
    expect(stage.to_state).toBe('update_staged');

    const commit = await orchestrator.commitUpdate(
      buildRequest('commit_update', {
        update_checks: {
          migration_passed: true,
          health_passed: true,
          invariants_passed: true,
        },
      }),
    );
    expect(commit.decision).toBe('allowed');
    expect(commit.state_record?.package_version).toBe('2.1.0');
    expect(commit.witness_ref.startsWith('evt_')).toBe(true);
    expect(
      commit.evidence_refs.some((ref: string) => ref.startsWith('witness:evt_')),
    ).toBe(true);
  });

  it('enforces import re-verification and remove retention decision contracts', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      now: () => new Date('2026-03-02T00:00:00.000Z'),
    });

    const blockedImport = await orchestrator.importPackage(
      buildRequest('import', {
        origin_class: 'self_created_local',
        package_id: 'skill:imported-local',
        admission: {
          signature_valid: true,
          signer_known: true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: true,
          reverification_complete: false,
          reapproval_complete: false,
        },
      }),
    );
    expect(blockedImport.decision).toBe('blocked');
    expect(blockedImport.reason_code).toBe('PKG-008-IMPORT_VERIFICATION_PENDING');

    await orchestrator.ingest(
      buildRequest('ingest', {
        package_id: 'skill:local-custom',
        origin_class: 'self_created_local',
      }),
    );
    await orchestrator.install(
      buildRequest('install', {
        package_id: 'skill:local-custom',
        origin_class: 'self_created_local',
        admission: {
          signature_valid: true,
          signer_known: true,
          policy_compatible: true,
          is_draft_unsigned: false,
          is_imported: false,
          reverification_complete: true,
          reapproval_complete: true,
        },
        compatibility: {
          api_compatible: true,
        },
      }),
    );

    const blockedRemove = await orchestrator.removePackage(
      buildRequest('remove', {
        package_id: 'skill:local-custom',
        origin_class: 'self_created_local',
      }),
    );
    expect(blockedRemove.decision).toBe('blocked');
    expect(blockedRemove.reason_code).toBe(
      'PKG-005-REMOVE_RETENTION_DECISION_REQUIRED',
    );

    const remove = await orchestrator.removePackage(
      buildRequest('remove', {
        package_id: 'skill:local-custom',
        origin_class: 'self_created_local',
        retention_decision: 'export_then_remove',
      }),
    );
    expect(remove.decision).toBe('allowed');
    expect(remove.to_state).toBe('removed');
  });
});
