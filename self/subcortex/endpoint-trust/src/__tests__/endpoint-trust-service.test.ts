import { describe, expect, it } from 'vitest';
import type {
  AcknowledgeInAppEscalationInput,
  ConfirmationProof,
  ControlCommandEnvelope,
  EscalationContract,
  EscalationId,
  EscalationResponse,
  IEscalationService,
  InAppEscalationRecord,
  IOpctlService,
  IRegistryService,
  IWitnessService,
  MaintainerIdentity,
  OpctlSubmitResult,
  ProjectId,
  RegistryAppealQuery,
  RegistryAppealQueryResult,
  RegistryAppealRecord,
  RegistryAppealResolutionInput,
  RegistryAppealSubmissionInput,
  RegistryBrowseRequest,
  RegistryBrowseResult,
  RegistryGovernanceAction,
  RegistryGovernanceActionInput,
  RegistryGovernanceTimelineRequest,
  RegistryGovernanceTimelineResult,
  RegistryInstallEligibilitySnapshot,
  RegistryMetadataValidationInput,
  RegistryMetadataValidationResult,
  RegistryPackage,
  RegistryRelease,
  RegistryReleaseSubmissionInput,
  RegistryReleaseSubmissionResult,
  ScopeSnapshot,
  VerificationReport,
  VerificationReportId,
  WitnessAuthorizationInput,
  WitnessCheckpoint,
  WitnessCompletionInput,
  WitnessEvent,
  WitnessInvariantInput,
  WitnessVerificationRequest,
} from '@nous/shared';
import { EndpointTrustService } from '../endpoint-trust-service.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-11T00:00:00.000Z';
const LATER = '2026-03-11T01:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655441041' as ProjectId;
const PERIPHERAL_ID = '550e8400-e29b-41d4-a716-446655441042';
const SENSOR_ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441043';
const ACTION_ENDPOINT_ID = '550e8400-e29b-41d4-a716-446655441044';

class FakeRegistryService implements IRegistryService {
  constructor(private readonly allow: boolean) {}
  async submitRelease(_input: RegistryReleaseSubmissionInput): Promise<RegistryReleaseSubmissionResult> { throw new Error('unused'); }
  async getPackage(_packageId: string): Promise<RegistryPackage | null> { return null; }
  async getRelease(_releaseId: string): Promise<RegistryRelease | null> { return null; }
  async listReleases(_packageId: string): Promise<RegistryRelease[]> { return []; }
  async validateMetadataChain(_input: RegistryMetadataValidationInput): Promise<RegistryMetadataValidationResult> { throw new Error('unused'); }
  async evaluateInstallEligibility(input: any): Promise<RegistryInstallEligibilitySnapshot> {
    return {
      project_id: input.project_id,
      package_id: input.package_id,
      release_id: input.release_id,
      package_version: '1.0.0',
      trust_tier: 'verified_maintainer',
      distribution_status: this.allow ? 'active' : 'blocked',
      compatibility_state: this.allow ? 'compatible' : 'blocked_incompatible',
      metadata_valid: this.allow,
      signer_valid: this.allow,
      requires_principal_override: false,
      block_reason_codes: this.allow ? [] : ['MKT-006-DISTRIBUTION_BLOCKED'],
      evidence_refs: [],
      evaluated_at: NOW,
    };
  }
  async applyGovernanceAction(_input: RegistryGovernanceActionInput): Promise<RegistryGovernanceAction> { throw new Error('unused'); }
  async getMaintainer(_maintainerId: string): Promise<MaintainerIdentity | null> { return null; }
  async listPackages(_input: RegistryBrowseRequest): Promise<RegistryBrowseResult> { throw new Error('unused'); }
  async getPackageMaintainers(_packageId: string): Promise<MaintainerIdentity[]> { return []; }
  async listGovernanceActions(_input: RegistryGovernanceTimelineRequest): Promise<RegistryGovernanceTimelineResult> { throw new Error('unused'); }
  async listAppeals(_input: RegistryAppealQuery): Promise<RegistryAppealQueryResult> { throw new Error('unused'); }
  async submitAppeal(_input: RegistryAppealSubmissionInput): Promise<RegistryAppealRecord> { throw new Error('unused'); }
  async resolveAppeal(_input: RegistryAppealResolutionInput): Promise<RegistryAppealRecord> { throw new Error('unused'); }
}

class FakeOpctlService implements IOpctlService {
  constructor(private readonly valid: boolean) {}
  async submitCommand(_envelope: ControlCommandEnvelope, _confirmationProof?: ConfirmationProof): Promise<OpctlSubmitResult> { throw new Error('unused'); }
  async requestConfirmationProof(_params: any): Promise<ConfirmationProof> { throw new Error('unused'); }
  async validateConfirmationProof(_proof: ConfirmationProof, _envelope: ControlCommandEnvelope): Promise<boolean> { return this.valid; }
  async resolveScope(_scope: any): Promise<ScopeSnapshot> { throw new Error('unused'); }
  async hasStartLock(_projectId: ProjectId): Promise<boolean> { return false; }
  async setStartLock(_projectId: ProjectId, _locked: boolean): Promise<void> {}
  async getProjectControlState(_projectId: ProjectId): Promise<any> { return 'running'; }
}

class FakeEscalationService implements IEscalationService {
  notifications: EscalationContract[] = [];
  async notify(contract: EscalationContract): Promise<EscalationId> {
    this.notifications.push(contract);
    return '550e8400-e29b-41d4-a716-446655441045' as EscalationId;
  }
  async checkResponse(_escalationId: EscalationId): Promise<EscalationResponse | null> { return null; }
  async get(_escalationId: EscalationId): Promise<InAppEscalationRecord | null> { return null; }
  async listProjectQueue(_projectId: ProjectId): Promise<InAppEscalationRecord[]> { return []; }
  async acknowledge(_input: AcknowledgeInAppEscalationInput): Promise<InAppEscalationRecord | null> { return null; }
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
  async appendInvariant(_input: WitnessInvariantInput): Promise<WitnessEvent> { throw new Error('unused'); }
  async createCheckpoint(_reason?: WitnessCheckpoint['reason']): Promise<WitnessCheckpoint> { throw new Error('unused'); }
  async rotateKeyEpoch(): Promise<number> { return 1; }
  async verify(_request?: WitnessVerificationRequest): Promise<VerificationReport> { throw new Error('unused'); }
  async getReport(_id: VerificationReportId): Promise<VerificationReport | null> { return null; }
  async listReports(_limit?: number): Promise<VerificationReport[]> { return []; }
  async getLatestCheckpoint(): Promise<WitnessCheckpoint | null> { return null; }
}

function createService(options?: {
  registryAllow?: boolean;
  confirmationValid?: boolean;
  escalationService?: FakeEscalationService;
}) {
  return new EndpointTrustService({
    documentStore: createMemoryDocumentStore(),
    registryService: new FakeRegistryService(options?.registryAllow ?? true),
    opctlService: new FakeOpctlService(options?.confirmationValid ?? true),
    escalationService: options?.escalationService ?? new FakeEscalationService(),
    witnessService: new FakeWitnessService(),
    now: () => NOW,
    idFactory: (() => {
      let sequence = 0;
      return () => `550e8400-e29b-41d4-a716-44665544105${sequence++}`;
    })(),
  });
}

async function pairAndApprove(service: EndpointTrustService, connector?: { packageId: string; releaseId: string }) {
  const pairing = await service.requestPairing({
    peripheral_id: PERIPHERAL_ID,
    project_id: PROJECT_ID,
    display_name: 'Peripheral',
    principal_id: 'principal',
    connector_package_id: connector?.packageId,
    connector_release_id: connector?.releaseId,
    metadata: {},
    evidence_refs: [],
  });
  await service.reviewPairing({
    pairing_id: pairing.pairing_id,
    approved: true,
    reviewed_by: 'principal',
    approval_evidence_ref: 'approval:pairing',
    evidence_refs: [],
  });
}

describe('EndpointTrustService', () => {
  it('pairs, registers, grants, and authorizes a sensory endpoint', async () => {
    const service = createService();

    await pairAndApprove(service, { packageId: 'pkg.audio', releaseId: 'release.audio' });
    const endpoint = await service.registerEndpoint({
      endpoint_id: SENSOR_ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      connector_package_id: 'pkg.audio',
      connector_release_id: 'release.audio',
      metadata: {},
      evidence_refs: ['endpoint:register'],
    });
    const grant = await service.grantCapability({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      policy_ref: 'policy:audio',
      granted_by: 'principal',
      evidence_refs: ['grant:audio'],
    });
    const session = await service.establishSession({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      established_by: 'principal',
      evidence_refs: ['session:start'],
      expires_at: LATER,
    });

    const result = await service.authorize({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: grant.capability_key,
      capability_class: 'sensory',
      risk: 'standard',
      policy_ref: grant.policy_ref,
      session_id: session.session_id,
      transport_envelope: {
        envelope_id: '550e8400-e29b-41d4-a716-446655441060',
        endpoint_id: endpoint.endpoint_id,
        peripheral_id: PERIPHERAL_ID,
        project_id: PROJECT_ID,
        session_id: session.session_id,
        nonce: '550e8400-e29b-41d4-a716-446655441061',
        sequence: 1,
        issued_at: NOW,
        expires_at: LATER,
        payload_hash: 'a'.repeat(64),
        signature: 'sig',
        metadata: {},
      },
      evidence_refs: ['authz:request'],
    });

    expect(result.decision).toBe('allowed');
  });

  it('blocks authorization when registry gating marks an endpoint ineligible', async () => {
    const service = createService({ registryAllow: false });

    await pairAndApprove(service, { packageId: 'pkg.audio', releaseId: 'release.audio' });
    const endpoint = await service.registerEndpoint({
      endpoint_id: SENSOR_ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      connector_package_id: 'pkg.audio',
      connector_release_id: 'release.audio',
      metadata: {},
      evidence_refs: [],
    });

    const result = await service.authorize({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      risk: 'standard',
      policy_ref: 'policy:audio',
      evidence_refs: [],
    });

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('NDT-402-ENDPOINT_NOT_TRUSTED');
  });

  it('requires valid confirmation proof for high-risk action commands', async () => {
    const service = createService({ confirmationValid: false });

    await pairAndApprove(service, { packageId: 'pkg.door', releaseId: 'release.door' });
    const endpoint = await service.registerEndpoint({
      endpoint_id: ACTION_ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Unlock',
      direction: 'action',
      capability_keys: ['door.unlock'],
      connector_package_id: 'pkg.door',
      connector_release_id: 'release.door',
      metadata: {},
      evidence_refs: [],
    });
    await service.grantCapability({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'door.unlock',
      capability_class: 'action',
      policy_ref: 'policy:door',
      granted_by: 'principal',
      evidence_refs: [],
    });

    const result = await service.authorize({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'door.unlock',
      capability_class: 'action',
      risk: 'high',
      policy_ref: 'policy:door',
      confirmation_proof: {
        proof_id: '550e8400-e29b-41d4-a716-446655441070',
        issued_at: NOW,
        expires_at: LATER,
        scope_hash: 'b'.repeat(64),
        action: 'edit',
        tier: 'T2',
        signature: 'proof',
      },
      control_command_envelope: {
        control_command_id: '550e8400-e29b-41d4-a716-446655441071' as any,
        actor_type: 'principal',
        actor_id: '550e8400-e29b-41d4-a716-446655441072',
        actor_session_id: '550e8400-e29b-41d4-a716-446655441073',
        actor_seq: 1,
        nonce: '550e8400-e29b-41d4-a716-446655441074',
        issued_at: NOW,
        expires_at: LATER,
        scope: {
          class: 'project_run_scope',
          kind: 'project_run',
          target_ids: [],
          project_id: PROJECT_ID,
        },
        payload_hash: 'c'.repeat(64),
        command_signature: 'sig',
        action: 'edit',
        payload: { capability: 'door.unlock' },
      },
      evidence_refs: [],
    });

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('NDT-408-CONFIRMATION_REQUIRED');
  });

  it('reports incidents and routes escalation while revoking active sessions', async () => {
    const escalationService = new FakeEscalationService();
    const service = createService({ escalationService });

    await pairAndApprove(service);
    const endpoint = await service.registerEndpoint({
      endpoint_id: SENSOR_ENDPOINT_ID,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      display_name: 'Capture',
      direction: 'sensory',
      capability_keys: ['audio.capture'],
      metadata: {},
      evidence_refs: [],
    });
    await service.grantCapability({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      policy_ref: 'policy:audio',
      granted_by: 'principal',
      evidence_refs: [],
    });
    const session = await service.establishSession({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      established_by: 'principal',
      evidence_refs: [],
    });

    const incident = await service.reportIncident({
      peripheral_id: PERIPHERAL_ID,
      endpoint_id: endpoint.endpoint_id,
      project_id: PROJECT_ID,
      incident_type: 'mitm_detected',
      reported_by: 'runtime',
      severity: 'critical',
      reason_code: 'NDT-901-MITM_DETECTED',
      metadata: {},
      evidence_refs: ['incident:mitm'],
    });

    expect(incident.action_taken).toContain('revoke_sessions');
    expect(escalationService.notifications).toHaveLength(1);
    const authorization = await service.authorize({
      endpoint_id: endpoint.endpoint_id,
      peripheral_id: PERIPHERAL_ID,
      project_id: PROJECT_ID,
      capability_key: 'audio.capture',
      capability_class: 'sensory',
      risk: 'standard',
      policy_ref: 'policy:audio',
      session_id: session.session_id,
      evidence_refs: [],
    });
    expect(authorization.decision).toBe('blocked');
  });
});
