import { randomUUID } from 'node:crypto';
import type {
  EscalationId,
  IEscalationService,
  IRegistryService,
  IWitnessService,
  MaintainerIdentity,
  ProjectId,
  RegistryAppealQuery,
  RegistryAppealQueryResult,
  RegistryAppealRecord,
  RegistryAppealResolutionInput,
  RegistryAppealSubmissionInput,
  RegistryBrowseRequest,
  RegistryBrowseResult,
  RegistryCompatibilityState,
  RegistryGovernanceTimelineRequest,
  RegistryGovernanceTimelineResult,
  RegistryGovernanceAction,
  RegistryGovernanceActionInput,
  RegistryInstallEligibilitySnapshot,
  RegistryMetadataValidationInput,
  RegistryMetadataValidationResult,
  RegistryPackage,
  RegistryRelease,
  RegistryReleaseSubmissionInput,
  RegistryReleaseSubmissionResult,
  RegistryTrustTier,
  WitnessEvent,
} from '@nous/shared';
import {
  MaintainerIdentitySchema,
  RegistryAppealRecordSchema,
  RegistryAppealResolutionInputSchema,
  RegistryAppealSubmissionInputSchema,
  RegistryDistributionStatusSchema,
  RegistryAppealQueryResultSchema,
  RegistryAppealQuerySchema,
  RegistryBrowseRequestSchema,
  RegistryBrowseResultSchema,
  RegistryEligibilityRequestSchema,
  RegistryGovernanceTimelineRequestSchema,
  RegistryGovernanceTimelineResultSchema,
  RegistryGovernanceActionInputSchema,
  RegistryGovernanceActionSchema,
  RegistryInstallEligibilitySnapshotSchema,
  RegistryMetadataValidationInputSchema,
  RegistryPackageSchema,
  MarketplaceSurfaceLink,
  RegistryReleaseSchema,
  RegistryReleaseSubmissionInputSchema,
  RegistryReleaseSubmissionResultSchema,
  normalizePackageType,
} from '@nous/shared';
import { evaluateRegistryEligibility } from './eligibility-evaluator.js';
import { validateRegistryMetadataChain } from './metadata-validator.js';
import { DocumentRegistryStore } from './document-registry-store.js';

export interface RegistryServiceOptions {
  registryStore: DocumentRegistryStore;
  escalationService?: IEscalationService;
  witnessService?: IWitnessService;
  now?: () => string;
  idFactory?: () => string;
}

function resolveCompatibilityState(
  input: RegistryReleaseSubmissionInput,
): RegistryCompatibilityState {
  return input.compatibility.data_schema_versions.length > 1
    ? 'requires_migration'
    : 'compatible';
}

function normalizeDistributionStatus(
  accepted: boolean,
): import('@nous/shared').RegistryDistributionStatus {
  return accepted ? 'active' : 'blocked';
}

export class RegistryService implements IRegistryService {
  private readonly now: () => string;

  constructor(private readonly options: RegistryServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async submitRelease(
    input: RegistryReleaseSubmissionInput,
  ): Promise<RegistryReleaseSubmissionResult> {
    const parsed = RegistryReleaseSubmissionInputSchema.parse(input);
    const canonicalPackageType = normalizePackageType(parsed.package_type);
    const timestamp = parsed.published_at ?? this.now();
    const releaseId = this.nextId();
    const maintainers = await this.ensureMaintainers(
      parsed.maintainer_ids,
      parsed.signing_key_id,
      timestamp,
    );
    const trustTier = this.resolveTrustTier(parsed, maintainers);
    const compatibilityState = resolveCompatibilityState(parsed);
    const metadataValidation = await this.validateMetadataChain({
      metadata_chain: parsed.metadata_chain,
      expected_artifact_digest: parsed.source_hash,
      minimum_versions: {
        root_version: parsed.metadata_chain.root_version,
        timestamp_version: parsed.metadata_chain.timestamp_version,
        snapshot_version: parsed.metadata_chain.snapshot_version,
        targets_version: parsed.metadata_chain.targets_version,
      },
      trusted_root_key_ids: parsed.metadata_chain.trusted_root_key_ids,
      revoked_key_ids: [],
      checked_at: timestamp,
      release_id: releaseId,
    });

    const initiallyAccepted =
      metadataValidation.valid &&
      trustTier !== 'unregistered_external' &&
      compatibilityState !== 'blocked_incompatible';
    const witnessRef = await this.recordWitness({
      actionRef: `registry-release:${parsed.package_id}:${parsed.package_version}`,
      status: initiallyAccepted ? 'succeeded' : 'blocked',
      projectId: parsed.project_id,
      detail: {
        packageId: parsed.package_id,
        releaseId,
        trustTier,
      },
    });

    const evidenceRefs = [`witness:${witnessRef}`];
    const packageRecord = RegistryPackageSchema.parse({
      package_id: parsed.package_id,
      package_type: canonicalPackageType,
      display_name: parsed.display_name,
      latest_release_id: releaseId,
      trust_tier: trustTier,
      distribution_status: normalizeDistributionStatus(initiallyAccepted),
      compatibility_state: compatibilityState,
      maintainer_ids: parsed.maintainer_ids,
      policy_profile_ref: parsed.policy_profile_ref,
      evidence_refs: evidenceRefs,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const releaseRecord = RegistryReleaseSchema.parse({
      release_id: releaseId,
      package_id: parsed.package_id,
      package_version: parsed.package_version,
      origin_class: parsed.origin_class,
      signing_key_id: parsed.signing_key_id,
      signature_set_ref: parsed.signature_set_ref,
      source_hash: parsed.source_hash,
      compatibility: parsed.compatibility,
      metadata_chain: parsed.metadata_chain,
      distribution_status: normalizeDistributionStatus(initiallyAccepted),
      compatibility_state: compatibilityState,
      evidence_refs: evidenceRefs,
      published_at: timestamp,
    });

    let eligibility = evaluateRegistryEligibility({
      request: RegistryEligibilityRequestSchema.parse({
        project_id: parsed.project_id,
        package_id: parsed.package_id,
        release_id: releaseId,
        principal_override_requested: false,
        principal_override_approved: false,
        evaluated_at: timestamp,
      }),
      packageRecord,
      releaseRecord,
      metadataValidation,
      now: this.now,
    });

    const accepted = eligibility.block_reason_codes.length === 0;
    const finalPackage = accepted
      ? packageRecord
      : {
          ...packageRecord,
          distribution_status: 'blocked' as const,
          updated_at: timestamp,
        };
    const finalRelease = accepted
      ? releaseRecord
      : {
          ...releaseRecord,
          distribution_status: 'blocked' as const,
        };

    await this.options.registryStore.savePackage(finalPackage);
    await this.options.registryStore.saveRelease(finalRelease);

    let escalationId: EscalationId | undefined;
    if (parsed.project_id && this.shouldEscalate(eligibility.block_reason_codes)) {
      escalationId = await this.options.escalationService?.notify({
        context: `Registry release ${parsed.package_id}@${parsed.package_version} was blocked`,
        triggerReason: eligibility.block_reason_codes.join(','),
        recommendation: 'Review registry trust, signature, and moderation posture.',
        requiredAction: 'Review blocked registry release',
        channel: 'in-app',
        projectId: parsed.project_id,
        priority: 'high',
        timestamp,
      });
    }

    eligibility = RegistryInstallEligibilitySnapshotSchema.parse({
      ...eligibility,
      distribution_status: accepted ? eligibility.distribution_status : 'blocked',
      evidence_refs: escalationId
        ? [...eligibility.evidence_refs, `escalation:${escalationId}`]
        : eligibility.evidence_refs,
    });

    return RegistryReleaseSubmissionResultSchema.parse({
      accepted,
      package: finalPackage,
      release: finalRelease,
      metadata_validation: metadataValidation,
      eligibility,
      witness_ref: witnessRef,
      evidence_refs: escalationId ? [...evidenceRefs, `escalation:${escalationId}`] : evidenceRefs,
      escalation_id: escalationId,
    });
  }

  async getPackage(packageId: string): Promise<RegistryPackage | null> {
    return this.options.registryStore.getPackage(packageId);
  }

  async getRelease(releaseId: string): Promise<RegistryRelease | null> {
    return this.options.registryStore.getRelease(releaseId);
  }

  async listReleases(packageId: string): Promise<RegistryRelease[]> {
    return this.options.registryStore.listReleasesByPackage(packageId);
  }

  async validateMetadataChain(
    input: RegistryMetadataValidationInput,
  ): Promise<RegistryMetadataValidationResult> {
    return validateRegistryMetadataChain(
      RegistryMetadataValidationInputSchema.parse(input),
      { now: this.now },
    );
  }

  async evaluateInstallEligibility(
    input: import('@nous/shared').RegistryEligibilityRequest,
  ): Promise<RegistryInstallEligibilitySnapshot> {
    const parsed = RegistryEligibilityRequestSchema.parse(input);
    const packageRecord = await this.options.registryStore.getPackage(parsed.package_id);
    const releaseRecord = await this.options.registryStore.getRelease(parsed.release_id);
    if (!packageRecord || !releaseRecord) {
      return RegistryInstallEligibilitySnapshotSchema.parse({
        project_id: parsed.project_id,
        package_id: parsed.package_id,
        release_id: parsed.release_id,
        package_version: 'unknown',
        trust_tier: 'community_unverified',
        distribution_status: 'blocked',
        compatibility_state: 'blocked_incompatible',
        metadata_valid: false,
        signer_valid: false,
        requires_principal_override:
          parsed.principal_override_requested && !parsed.principal_override_approved,
        block_reason_codes: ['MKT-006-DISTRIBUTION_BLOCKED'],
        evidence_refs: [],
        evaluated_at: parsed.evaluated_at ?? this.now(),
      });
    }

    const metadataValidation = validateRegistryMetadataChain(
      {
        metadata_chain: releaseRecord.metadata_chain,
        expected_artifact_digest: releaseRecord.source_hash,
        minimum_versions: {
          root_version: releaseRecord.metadata_chain.root_version,
          timestamp_version: releaseRecord.metadata_chain.timestamp_version,
          snapshot_version: releaseRecord.metadata_chain.snapshot_version,
          targets_version: releaseRecord.metadata_chain.targets_version,
        },
        trusted_root_key_ids: releaseRecord.metadata_chain.trusted_root_key_ids,
        revoked_key_ids: [],
        checked_at: parsed.evaluated_at ?? this.now(),
        release_id: releaseRecord.release_id,
      },
      { now: this.now },
    );

    return evaluateRegistryEligibility({
      request: parsed,
      packageRecord,
      releaseRecord,
      metadataValidation,
      now: this.now,
    });
  }

  async applyGovernanceAction(
    input: RegistryGovernanceActionInput,
  ): Promise<RegistryGovernanceAction> {
    const parsed = RegistryGovernanceActionInputSchema.parse(input);
    this.assertGovernanceAuthority(parsed);

    const timestamp = this.now();
    const actionId = this.nextId();
    const witnessRef = await this.recordWitness({
      actionRef: `registry-governance:${parsed.action_type}:${actionId}`,
      status: 'succeeded',
      detail: {
        actionType: parsed.action_type,
        packageId: parsed.package_id,
        releaseId: parsed.release_id,
      },
    });
    const action = RegistryGovernanceActionSchema.parse({
      action_id: actionId,
      action_type: parsed.action_type,
      package_id: parsed.package_id,
      release_id: parsed.release_id,
      maintainer_id: parsed.maintainer_id,
      actor_id: parsed.actor_id,
      reason_code: parsed.reason_code,
      target_distribution_status: parsed.target_distribution_status,
      target_moderation_state: parsed.target_moderation_state,
      target_verification_state: parsed.target_verification_state,
      target_signing_key_id: parsed.target_signing_key_id,
      approval_evidence_ref: parsed.approval_evidence_ref,
      witness_ref: witnessRef,
      evidence_refs: [...new Set([...parsed.evidence_refs, `witness:${witnessRef}`])],
      created_at: timestamp,
    });

    await this.options.registryStore.saveGovernanceAction(action);
    await this.applyGovernanceMutation(action, timestamp);
    return action;
  }

  async getMaintainer(maintainerId: string): Promise<MaintainerIdentity | null> {
    return this.options.registryStore.getMaintainer(maintainerId);
  }

  async listPackages(input: RegistryBrowseRequest): Promise<RegistryBrowseResult> {
    const parsed = RegistryBrowseRequestSchema.parse(input);
    const query = parsed.query.trim().toLowerCase();
    const allPackages = await this.options.registryStore.listPackages();
    const filtered = allPackages.filter((record) => {
      if (
        query &&
        !record.package_id.toLowerCase().includes(query) &&
        !record.display_name.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (parsed.trustTiers.length > 0 && !parsed.trustTiers.includes(record.trust_tier)) {
        return false;
      }
      if (
        parsed.distributionStatuses.length > 0 &&
        !parsed.distributionStatuses.includes(record.distribution_status)
      ) {
        return false;
      }
      if (
        parsed.compatibilityStates.length > 0 &&
        !parsed.compatibilityStates.includes(record.compatibility_state)
      ) {
        return false;
      }
      return true;
    });

    const start = (parsed.page - 1) * parsed.pageSize;
    const selected = filtered.slice(start, start + parsed.pageSize);
    const items = await Promise.all(
      selected.map(async (record) => {
        const latestRelease = record.latest_release_id
          ? await this.options.registryStore.getRelease(record.latest_release_id)
          : null;
        const maintainers = await this.options.registryStore.listMaintainersByIds(
          record.maintainer_ids,
        );
        const trustEligibility =
          parsed.projectId && latestRelease
            ? await this.evaluateInstallEligibility({
                project_id: parsed.projectId,
                package_id: record.package_id,
                release_id: latestRelease.release_id,
                principal_override_requested: false,
                principal_override_approved: false,
              })
            : null;

        return {
          package: record,
          latestRelease,
          maintainers,
          trustEligibility,
          deepLinks: this.buildPackageDeepLinks({
            packageId: record.package_id,
            projectId: parsed.projectId,
            releaseId: latestRelease?.release_id,
          }),
        };
      }),
    );

    return RegistryBrowseResultSchema.parse({
      query: parsed,
      items,
      totalCount: filtered.length,
      generatedAt: this.now(),
    });
  }

  async getPackageMaintainers(packageId: string): Promise<MaintainerIdentity[]> {
    const packageRecord = await this.options.registryStore.getPackage(packageId);
    if (!packageRecord) {
      return [];
    }
    return this.options.registryStore.listMaintainersByIds(packageRecord.maintainer_ids);
  }

  async listGovernanceActions(
    input: RegistryGovernanceTimelineRequest,
  ): Promise<RegistryGovernanceTimelineResult> {
    const parsed = RegistryGovernanceTimelineRequestSchema.parse(input);
    const actions = (await this.options.registryStore.listGovernanceActions())
      .filter((action) => {
        if (parsed.packageId && action.package_id !== parsed.packageId) {
          return false;
        }
        if (parsed.releaseId && action.release_id !== parsed.releaseId) {
          return false;
        }
        if (parsed.maintainerId && action.maintainer_id !== parsed.maintainerId) {
          return false;
        }
        if (
          parsed.actionTypes.length > 0 &&
          !parsed.actionTypes.includes(action.action_type)
        ) {
          return false;
        }
        return true;
      })
      .slice(0, parsed.limit);

    return RegistryGovernanceTimelineResultSchema.parse({
      actions,
      generatedAt: this.now(),
    });
  }

  async listAppeals(input: RegistryAppealQuery): Promise<RegistryAppealQueryResult> {
    const parsed = RegistryAppealQuerySchema.parse(input);
    const appeals = (await this.options.registryStore.listAppeals())
      .filter((appeal) => {
        if (parsed.packageId && appeal.package_id !== parsed.packageId) {
          return false;
        }
        if (parsed.maintainerId && appeal.maintainer_id !== parsed.maintainerId) {
          return false;
        }
        if (
          !parsed.includeResolved &&
          (appeal.status === 'resolved_upheld' ||
            appeal.status === 'resolved_reinstated')
        ) {
          return false;
        }
        if (parsed.statuses.length > 0 && !parsed.statuses.includes(appeal.status)) {
          return false;
        }
        return true;
      })
      .slice(0, parsed.limit);

    return RegistryAppealQueryResultSchema.parse({
      appeals,
      generatedAt: this.now(),
    });
  }

  async submitAppeal(
    input: RegistryAppealSubmissionInput,
  ): Promise<RegistryAppealRecord> {
    const parsed = RegistryAppealSubmissionInputSchema.parse(input);
    const timestamp = this.now();
    const witnessRef = await this.recordWitness({
      actionRef: `registry-appeal:${parsed.package_id}:${parsed.maintainer_id}`,
      status: 'succeeded',
      detail: {
        packageId: parsed.package_id,
        maintainerId: parsed.maintainer_id,
      },
    });

    const appeal = RegistryAppealRecordSchema.parse({
      appeal_id: this.nextId(),
      package_id: parsed.package_id,
      release_id: parsed.release_id,
      maintainer_id: parsed.maintainer_id,
      submitted_reason: parsed.submitted_reason,
      submitted_evidence_refs: [
        ...parsed.submitted_evidence_refs,
        `witness:${witnessRef}`,
      ],
      status: 'submitted',
      created_at: timestamp,
      updated_at: timestamp,
    });

    await this.options.registryStore.saveAppeal(appeal);
    return appeal;
  }

  async resolveAppeal(
    input: RegistryAppealResolutionInput,
  ): Promise<RegistryAppealRecord> {
    const parsed = RegistryAppealResolutionInputSchema.parse(input);
    const existing = await this.options.registryStore.getAppeal(parsed.appeal_id);
    if (!existing) {
      throw new Error(`Appeal not found: ${parsed.appeal_id}`);
    }

    const action = await this.applyGovernanceAction({
      action_type: 'resolve_appeal',
      package_id: existing.package_id,
      release_id: existing.release_id,
      maintainer_id: existing.maintainer_id,
      actor_id: parsed.actor_id,
      reason_code: parsed.reason_code,
      approval_evidence_ref: parsed.approval_evidence_ref,
      evidence_refs: parsed.resolution_evidence_refs,
    });

    const updated = RegistryAppealRecordSchema.parse({
      ...existing,
      status:
        parsed.resolution === 'reinstate'
          ? 'resolved_reinstated'
          : 'resolved_upheld',
      resolution_action_id: action.action_id,
      updated_at: this.now(),
    });

    await this.options.registryStore.saveAppeal(updated);
    return updated;
  }

  private async ensureMaintainers(
    maintainerIds: readonly string[],
    signingKeyId: string,
    timestamp: string,
  ): Promise<MaintainerIdentity[]> {
    const maintainers: MaintainerIdentity[] = [];
    for (const maintainerId of maintainerIds) {
      const existing = await this.options.registryStore.getMaintainer(maintainerId);
      if (existing) {
        maintainers.push(existing);
        continue;
      }

      const created = MaintainerIdentitySchema.parse({
        maintainer_id: maintainerId,
        display_name: maintainerId,
        verification_state: 'unverified',
        roles: ['maintainer'],
        signer_key_ids: [signingKeyId],
        evidence_refs: [],
        updated_at: timestamp,
      });
      await this.options.registryStore.saveMaintainer(created);
      maintainers.push(created);
    }
    return maintainers;
  }

  private resolveTrustTier(
    input: RegistryReleaseSubmissionInput,
    maintainers: readonly MaintainerIdentity[],
  ): RegistryTrustTier {
    if (input.origin_class === 'nous_first_party') {
      return 'nous_first_party';
    }
    if (!input.registered) {
      return 'unregistered_external';
    }
    if (
      maintainers.some(
        (maintainer) => maintainer.verification_state !== 'unverified',
      )
    ) {
      return 'verified_maintainer';
    }
    return 'community_unverified';
  }

  private shouldEscalate(reasonCodes: readonly string[]): boolean {
    return reasonCodes.some(
      (reasonCode) =>
        reasonCode === 'MKT-002-UNREGISTERED_EXTERNAL' ||
        reasonCode.startsWith('MKT-008-'),
    );
  }

  private assertGovernanceAuthority(input: RegistryGovernanceActionInput): void {
    if (
      input.action_type === 'approve_break_glass_override' ||
      input.action_type === 'change_trust_root'
    ) {
      if (input.actor_id !== 'principal') {
        throw new Error(`${input.action_type} requires principal actor`);
      }
      if (!input.approval_evidence_ref) {
        throw new Error(`${input.action_type} requires approval evidence`);
      }
    }
  }

  private async applyGovernanceMutation(
    action: RegistryGovernanceAction,
    timestamp: string,
  ): Promise<void> {
    if (action.package_id) {
      const existingPackage = await this.options.registryStore.getPackage(action.package_id);
      if (existingPackage) {
        const nextDistribution =
          action.target_distribution_status ??
          (action.action_type === 'change_distribution_status'
            ? 'blocked'
            : existingPackage.distribution_status);
        const nextModeration =
          action.target_moderation_state ??
          (action.action_type === 'apply_moderation_action'
            ? 'distribution_hold'
            : existingPackage.moderation_state);
        await this.options.registryStore.savePackage({
          ...existingPackage,
          distribution_status: RegistryDistributionStatusSchema.parse(nextDistribution),
          moderation_state: nextModeration,
          evidence_refs: [...existingPackage.evidence_refs, action.witness_ref],
          updated_at: timestamp,
        });
      }
    }

    if (action.release_id) {
      const existingRelease = await this.options.registryStore.getRelease(action.release_id);
      if (existingRelease && action.target_distribution_status) {
        await this.options.registryStore.saveRelease({
          ...existingRelease,
          distribution_status: action.target_distribution_status,
          evidence_refs: [...existingRelease.evidence_refs, action.witness_ref],
        });
      }
    }

    if (action.maintainer_id) {
      const existingMaintainer =
        await this.options.registryStore.getMaintainer(action.maintainer_id);
      const baseMaintainer = existingMaintainer ??
        MaintainerIdentitySchema.parse({
          maintainer_id: action.maintainer_id,
          display_name: action.maintainer_id,
          verification_state: 'unverified',
          roles: ['maintainer'],
          signer_key_ids: [],
          evidence_refs: [],
          updated_at: timestamp,
        });
      const nextVerificationState =
        action.target_verification_state ??
        (action.action_type === 'verify_maintainer'
          ? 'verified_individual'
          : baseMaintainer.verification_state);
      const nextSigningKeys = action.target_signing_key_id
        ? [...new Set([...baseMaintainer.signer_key_ids, action.target_signing_key_id])]
        : baseMaintainer.signer_key_ids;
      await this.options.registryStore.saveMaintainer({
        ...baseMaintainer,
        verification_state: nextVerificationState,
        signer_key_ids: nextSigningKeys,
        verified_at:
          nextVerificationState === 'unverified'
            ? baseMaintainer.verified_at
            : timestamp,
        evidence_refs: [...baseMaintainer.evidence_refs, action.witness_ref],
        updated_at: timestamp,
      });
    }
  }

  private async recordWitness(input: {
    actionRef: string;
    status: 'succeeded' | 'blocked';
    projectId?: ProjectId;
    detail: Record<string, unknown>;
  }): Promise<string> {
    if (!this.options.witnessService) {
      return `registry-${input.actionRef}-${this.nextId()}`;
    }

    const authorization = await this.options.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef: input.actionRef,
      projectId: input.projectId,
      actor: 'subcortex',
      status: 'approved',
      detail: input.detail,
    });
    const completion = await this.options.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef: input.actionRef,
      authorizationRef: authorization.id,
      projectId: input.projectId,
      actor: 'subcortex',
      status: input.status,
      detail: input.detail,
    });
    return this.resolveWitnessRef(completion);
  }

  private resolveWitnessRef(event: WitnessEvent): string {
    return event.id;
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }

  private buildPackageDeepLinks(input: {
    packageId: string;
    projectId?: ProjectId;
    releaseId?: string;
  }): MarketplaceSurfaceLink[] {
    const links: MarketplaceSurfaceLink[] = [
      {
        target: 'artifact',
        packageId: input.packageId,
        projectId: input.projectId,
        releaseId: input.releaseId,
      },
    ];

    if (input.projectId) {
      links.push({
        target: 'projects',
        packageId: input.packageId,
        projectId: input.projectId,
        releaseId: input.releaseId,
      });
      links.push({
        target: 'mao',
        packageId: input.packageId,
        projectId: input.projectId,
        releaseId: input.releaseId,
      });
    }

    return links;
  }
}
