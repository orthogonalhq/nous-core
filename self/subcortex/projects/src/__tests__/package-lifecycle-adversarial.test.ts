import { describe, expect, it } from 'vitest';
import type {
  PackageLifecycleDecisionEvent,
  PackageLifecycleTransitionRequest,
} from '@nous/shared';
import { PackageLifecycleOrchestrator } from '../package-lifecycle/orchestrator.js';
import {
  InMemoryPackageLifecycleStateStore,
  LifecycleStateConflictError,
} from '../package-lifecycle/state-store.js';
import type { PackageLifecycleEvidenceEmitter } from '../package-lifecycle/evidence-emitter.js';

const BASE_REQUEST: Omit<
  PackageLifecycleTransitionRequest,
  'target_transition'
> = {
  project_id: 'project-adv',
  package_id: 'skill:adversarial',
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

class ConflictStateStore extends InMemoryPackageLifecycleStateStore {
  private writes = 0;

  override async upsert(
    record: Parameters<InMemoryPackageLifecycleStateStore['upsert']>[0],
    expectedVersion?: number,
  ) {
    this.writes += 1;
    if (this.writes > 1) {
      throw new LifecycleStateConflictError('forced conflict');
    }
    return super.upsert(record, expectedVersion);
  }
}

class MissingWitnessEmitter implements PackageLifecycleEvidenceEmitter {
  async emit(
    event: Omit<PackageLifecycleDecisionEvent, 'witness_ref'> & {
      witness_ref?: string;
    },
  ): Promise<PackageLifecycleDecisionEvent> {
    return {
      ...event,
      witness_ref: '',
    };
  }
}

describe('PackageLifecycleOrchestrator adversarial flows', () => {
  it('blocks invalid transition jumps', async () => {
    const orchestrator = new PackageLifecycleOrchestrator();
    const result = await orchestrator.install(
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
      }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('PKG-005-INVALID_TRANSITION');
  });

  it('returns deterministic blocked outcome on optimistic concurrency conflict', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      stateStore: new ConflictStateStore(),
    });

    const ingest = await orchestrator.ingest(buildRequest('ingest'));
    expect(ingest.decision).toBe('allowed');

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
    expect(install.decision).toBe('blocked');
    expect(install.reason_code).toBe('PKG-005-INVALID_TRANSITION');
  });

  it('blocks import enablement until self_created_local trust transfer checks complete', async () => {
    const orchestrator = new PackageLifecycleOrchestrator();

    const result = await orchestrator.importPackage(
      buildRequest('import', {
        origin_class: 'self_created_local',
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

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('PKG-008-IMPORT_VERIFICATION_PENDING');
  });

  it('fails closed when witness linkage is missing', async () => {
    const orchestrator = new PackageLifecycleOrchestrator({
      evidenceEmitter: new MissingWitnessEmitter(),
    });

    const result = await orchestrator.ingest(buildRequest('ingest'));
    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('PKG-005-MISSING_WITNESS_REF');
  });

  it('blocks replayed registry metadata during install', async () => {
    const orchestrator = new PackageLifecycleOrchestrator();

    await orchestrator.ingest(buildRequest('ingest'));

    const result = await orchestrator.install(
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
          package_id: 'skill:adversarial',
          release_id: 'release-adv-1',
          package_version: '1.0.0',
          trust_tier: 'verified_maintainer',
          distribution_status: 'active',
          compatibility_state: 'compatible',
          metadata_valid: false,
          signer_valid: true,
          requires_principal_override: false,
          block_reason_codes: ['MKT-008-METADATA_REPLAYED'],
          evidence_refs: ['witness:registry-adv'],
          evaluated_at: '2026-03-10T00:00:00.000Z',
        },
      }),
    );

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('MKT-008-METADATA_REPLAYED');
  });
});
