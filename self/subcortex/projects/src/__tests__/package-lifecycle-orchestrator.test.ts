import { describe, expect, it } from 'vitest';
import type { PackageLifecycleTransitionRequest } from '@nous/shared';
import { PackageLifecycleOrchestrator } from '../package-lifecycle/orchestrator.js';

const BASE_REQUEST: Omit<
  PackageLifecycleTransitionRequest,
  'target_transition'
> = {
  project_id: 'project-123',
  package_id: 'skill:image-quality-assessment',
  package_version: '1.0.0',
  origin_class: 'third_party_external',
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

describe('PackageLifecycleOrchestrator', () => {
  it('supports ingest -> install -> enable happy path', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      now: () => new Date('2026-03-02T00:00:00.000Z'),
    });

    const ingest = await orchestrator.ingest(buildRequest('ingest'));
    expect(ingest.decision).toBe('allowed');
    expect(ingest.to_state).toBe('ingested');

    const install = await orchestrator.install(
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
    expect(install.decision).toBe('allowed');
    expect(install.to_state).toBe('installed');

    const enable = await orchestrator.enable(
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
    expect(enable.decision).toBe('allowed');
    expect(enable.to_state).toBe('enabled');
  });

  it('stages and commits updates when checks pass', async () => {
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

    const stage = await orchestrator.stageUpdate(
      buildRequest('stage_update', {
        target_version: '1.1.0',
        checkpoint_ref: 'checkpoint-1',
        compatibility: { api_compatible: true },
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
    expect(commit.to_state).toBe('update_committed');
    expect(commit.state_record?.package_version).toBe('1.1.0');
  });

  it('falls back to rolled_back when commit checks fail and rollback trust checks pass', async () => {
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
    await orchestrator.stageUpdate(
      buildRequest('stage_update', {
        target_version: '1.1.0',
        checkpoint_ref: 'checkpoint-1',
      }),
    );

    const commit = await orchestrator.commitUpdate(
      buildRequest('commit_update', {
        update_checks: {
          migration_passed: false,
          health_passed: true,
          invariants_passed: true,
        },
        rollback: {
          trust_checks_passed: true,
        },
      }),
    );

    expect(commit.decision).toBe('rolled_back');
    expect(commit.to_state).toBe('rolled_back');
    expect(commit.reason_code).toBe('PKG-004-UPDATE_STAGE_CHECK_FAILED');
  });

  it('requires explicit retention decision for remove transitions', async () => {
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

    const blockedRemove = await orchestrator.removePackage(buildRequest('remove'));
    expect(blockedRemove.decision).toBe('blocked');
    expect(blockedRemove.reason_code).toBe(
      'PKG-005-REMOVE_RETENTION_DECISION_REQUIRED',
    );
  });

  it('blocks install when registry eligibility requires Principal override', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      now: () => new Date('2026-03-02T00:00:00.000Z'),
    });

    await orchestrator.ingest(buildRequest('ingest'));

    const install = await orchestrator.install(
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
        registry_eligibility: {
          package_id: 'skill:image-quality-assessment',
          release_id: 'release-1',
          package_version: '1.0.0',
          trust_tier: 'community_unverified',
          distribution_status: 'active',
          compatibility_state: 'compatible',
          metadata_valid: true,
          signer_valid: true,
          requires_principal_override: true,
          block_reason_codes: [],
          evidence_refs: ['witness:registry'],
          evaluated_at: '2026-03-02T00:00:00.000Z',
        },
      }),
    );

    expect(install.decision).toBe('blocked');
    expect(install.reason_code).toBe('MKT-004-PRINCIPAL_OVERRIDE_REQUIRED');
  });
});
