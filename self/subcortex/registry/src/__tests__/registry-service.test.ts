import { describe, expect, it } from 'vitest';
import type {
  AcknowledgeInAppEscalationInput,
  EscalationContract,
  EscalationId,
  EscalationResponse,
  IEscalationService,
  InAppEscalationRecord,
  ProjectId,
  VerificationReport,
  VerificationReportId,
  WitnessAuthorizationInput,
  WitnessCheckpoint,
  WitnessCompletionInput,
  WitnessEvent,
  WitnessInvariantInput,
  WitnessVerificationRequest,
  IWitnessService,
} from '@nous/shared';
import { DocumentRegistryStore } from '../document-registry-store.js';
import { RegistryService } from '../registry-service.js';
import { createMemoryDocumentStore } from './test-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440301' as ProjectId;
const NOW = '2026-03-10T00:00:00.000Z';

class FakeEscalationService implements IEscalationService {
  readonly notified: EscalationContract[] = [];

  async notify(contract: EscalationContract): Promise<EscalationId> {
    this.notified.push(contract);
    return '550e8400-e29b-41d4-a716-446655440399' as EscalationId;
  }

  async checkResponse(_escalationId: EscalationId): Promise<EscalationResponse | null> {
    return null;
  }

  async get(_escalationId: EscalationId): Promise<InAppEscalationRecord | null> {
    return null;
  }

  async listProjectQueue(_projectId: string): Promise<InAppEscalationRecord[]> {
    return [];
  }

  async acknowledge(
    _input: AcknowledgeInAppEscalationInput,
  ): Promise<InAppEscalationRecord | null> {
    return null;
  }
}

class FakeWitnessService implements IWitnessService {
  private sequence = 0;

  private nextEventId(): string {
    this.sequence += 1;
    return `evt-${this.sequence}`;
  }

  async appendAuthorization(input: WitnessAuthorizationInput): Promise<WitnessEvent> {
    return {
      id: this.nextEventId() as WitnessEvent['id'],
      sequence: this.sequence,
      previousEventHash: null,
      payloadHash: 'a'.repeat(64),
      eventHash: 'b'.repeat(64),
      stage: 'authorization',
      actionCategory: input.actionCategory,
      actionRef: input.actionRef,
      traceId: input.traceId,
      projectId: input.projectId,
      actor: input.actor,
      status: input.status,
      detail: input.detail,
      occurredAt: input.occurredAt ?? NOW,
      recordedAt: NOW,
    };
  }

  async appendCompletion(input: WitnessCompletionInput): Promise<WitnessEvent> {
    return {
      id: this.nextEventId() as WitnessEvent['id'],
      sequence: this.sequence,
      previousEventHash: 'b'.repeat(64),
      payloadHash: 'c'.repeat(64),
      eventHash: 'd'.repeat(64),
      stage: 'completion',
      actionCategory: input.actionCategory,
      actionRef: input.actionRef,
      authorizationRef: input.authorizationRef,
      traceId: input.traceId,
      projectId: input.projectId,
      actor: input.actor,
      status: input.status,
      detail: input.detail,
      occurredAt: input.occurredAt ?? NOW,
      recordedAt: NOW,
    };
  }

  async appendInvariant(_input: WitnessInvariantInput): Promise<WitnessEvent> {
    throw new Error('Not implemented in fake');
  }

  async createCheckpoint(_reason?: WitnessCheckpoint['reason']): Promise<WitnessCheckpoint> {
    throw new Error('Not implemented in fake');
  }

  async rotateKeyEpoch(): Promise<number> {
    return 1;
  }

  async verify(_request?: WitnessVerificationRequest): Promise<VerificationReport> {
    throw new Error('Not implemented in fake');
  }

  async getReport(_id: VerificationReportId): Promise<VerificationReport | null> {
    return null;
  }

  async listReports(_limit?: number): Promise<VerificationReport[]> {
    return [];
  }

  async getLatestCheckpoint(): Promise<WitnessCheckpoint | null> {
    return null;
  }
}

function createService() {
  const escalationService = new FakeEscalationService();
  const service = new RegistryService({
    registryStore: new DocumentRegistryStore(createMemoryDocumentStore()),
    escalationService,
    witnessService: new FakeWitnessService(),
    now: () => NOW,
    idFactory: (() => {
      let index = 0;
      const ids = ['release-1', 'action-1', 'appeal-1', 'fallback-1'];
      return () => ids[index++] ?? `generated-${index}`;
    })(),
  });

  return { service, escalationService };
}

describe('RegistryService', () => {
  it('accepts registered releases from verified maintainers', async () => {
    const { service } = createService();

    await service.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:1',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval-1',
      evidence_refs: ['approval:1'],
    });

    const result = await service.submitRelease({
      project_id: PROJECT_ID,
      package_id: 'pkg.persona-engine',
      package_type: 'project',
      display_name: 'Persona Engine',
      package_version: '1.0.0',
      origin_class: 'third_party_external',
      registered: true,
      signing_key_id: 'key-1',
      signature_set_ref: 'sigset-1',
      source_hash: 'sha256:abc123',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['model.invoke'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2026-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:abc123',
        metadata_digest: 'sha256:def456',
      },
      maintainer_ids: ['maintainer:1'],
      published_at: NOW,
    });

    expect(result.accepted).toBe(true);
    expect(result.package.trust_tier).toBe('verified_maintainer');
    expect(result.eligibility.block_reason_codes).toEqual([]);
  });

  it('blocks unregistered external releases and routes escalation', async () => {
    const { service, escalationService } = createService();

    const result = await service.submitRelease({
      project_id: PROJECT_ID,
      package_id: 'pkg.unknown',
      package_type: 'skill',
      display_name: 'Unknown Package',
      package_version: '1.0.0',
      origin_class: 'third_party_external',
      registered: false,
      signing_key_id: 'key-1',
      signature_set_ref: 'sigset-1',
      source_hash: 'sha256:abc123',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['model.invoke'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2026-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:abc123',
        metadata_digest: 'sha256:def456',
      },
      maintainer_ids: ['maintainer:2'],
      published_at: NOW,
    });

    expect(result.accepted).toBe(false);
    expect(result.eligibility.block_reason_codes).toContain(
      'MKT-002-UNREGISTERED_EXTERNAL',
    );
    expect(escalationService.notified).toHaveLength(1);
  });

  it('rejects non-principal trust-root changes', async () => {
    const { service } = createService();

    await expect(
      service.applyGovernanceAction({
        action_type: 'change_trust_root',
        actor_id: 'operator',
        reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
        evidence_refs: ['attempt:1'],
      }),
    ).rejects.toThrow('change_trust_root requires principal actor');
  });

  it('records and resolves appeals through governance actions', async () => {
    const { service } = createService();

    const appeal = await service.submitAppeal({
      package_id: 'pkg.persona-engine',
      maintainer_id: 'maintainer:1',
      submitted_reason: 'Please reinstate',
      submitted_evidence_refs: ['appeal:1'],
    });

    const resolved = await service.resolveAppeal({
      appeal_id: appeal.appeal_id,
      actor_id: 'principal',
      resolution: 'reinstate',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      approval_evidence_ref: 'approval-1',
      resolution_evidence_refs: ['resolution:1'],
    });

    expect(resolved.status).toBe('resolved_reinstated');
    expect(resolved.resolution_action_id).toBeTruthy();
  });

  it('lists canonical browse, governance, and appeal projections', async () => {
    const { service } = createService();

    await service.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:1',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval-1',
      evidence_refs: ['approval:1'],
    });

    const submission = await service.submitRelease({
      project_id: PROJECT_ID,
      package_id: 'pkg.persona-engine',
      package_type: 'project',
      display_name: 'Persona Engine',
      package_version: '1.0.0',
      origin_class: 'third_party_external',
      registered: true,
      signing_key_id: 'key-1',
      signature_set_ref: 'sigset-1',
      source_hash: 'sha256:abc123',
      compatibility: {
        api_contract_range: '^1.0.0',
        capability_manifest: ['model.invoke'],
        migration_contract_version: '1',
        data_schema_versions: ['1'],
        policy_profile_defaults: [],
      },
      metadata_chain: {
        root_version: 1,
        timestamp_version: 1,
        snapshot_version: 1,
        targets_version: 1,
        trusted_root_key_ids: ['root-a'],
        delegated_key_ids: [],
        metadata_expires_at: '2026-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:abc123',
        metadata_digest: 'sha256:def456',
      },
      maintainer_ids: ['maintainer:1'],
      published_at: NOW,
    });
    await service.submitAppeal({
      package_id: submission.package.package_id,
      release_id: submission.release.release_id,
      maintainer_id: 'maintainer:1',
      submitted_reason: 'Review requested',
      submitted_evidence_refs: ['appeal:1'],
    });

    const browse = await service.listPackages({
      query: 'persona',
      trustTiers: [],
      distributionStatuses: [],
      compatibilityStates: [],
      page: 1,
      pageSize: 10,
      projectId: PROJECT_ID,
    });
    const governance = await service.listGovernanceActions({
      maintainerId: 'maintainer:1',
      limit: 10,
      actionTypes: [],
    });
    const appeals = await service.listAppeals({
      packageId: 'pkg.persona-engine',
      statuses: [],
      includeResolved: true,
      limit: 10,
    });
    const maintainers = await service.getPackageMaintainers('pkg.persona-engine');

    expect(browse.items).toHaveLength(1);
    expect(browse.items[0].trustEligibility?.project_id).toBe(PROJECT_ID);
    expect(governance.actions[0]?.action_type).toBe('verify_maintainer');
    expect(appeals.appeals).toHaveLength(1);
    expect(maintainers[0]?.maintainer_id).toBe('maintainer:1');
  });
});
