import { beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { appRouter } from '../trpc/root';
import { clearNousContextCache, createNousContext } from '../bootstrap';
import { createProjectConfig } from '../../test-support/project-fixtures';

const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
} as const;

describe('marketplace router', () => {
  beforeAll(() => {
    process.env.NOUS_DATA_DIR = join(tmpdir(), `nous-marketplace-router-${randomUUID()}`);
    clearNousContextCache();
  });

  it('projects canonical registry and nudge truth through browse, detail, moderation, feed, suppression, and acceptance procedures', async () => {
    const ctx = createNousContext();
    const caller = appRouter.createCaller(ctx);
    const projectId = await ctx.projectStore.create(createProjectConfig({
      id: randomUUID() as any,
      name: 'Marketplace Router Project',
    }));

    await ctx.registryService.applyGovernanceAction({
      action_type: 'verify_maintainer',
      maintainer_id: 'maintainer:1',
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_verification_state: 'verified_individual',
      approval_evidence_ref: 'approval:1',
      evidence_refs: ['approval:1'],
    });

    const submission = await ctx.registryService.submitRelease({
      project_id: projectId,
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
        metadata_expires_at: '2027-03-12T00:00:00.000Z',
        artifact_digest: 'sha256:abc123',
        metadata_digest: 'sha256:def456',
      },
      maintainer_ids: ['maintainer:1'],
      published_at: '2026-03-10T00:00:00.000Z',
    });

    await ctx.nudgeDiscoveryService.recordSignal({
      signal_type: 'workflow_friction',
      target_scope: 'project',
      source_refs: ['persona'],
      requesting_project_id: projectId,
      evidence_refs: [EVIDENCE_REF],
    });

    const browse = await caller.marketplace.browsePackages({
      query: 'persona',
      trustTiers: [],
      distributionStatuses: [],
      compatibilityStates: [],
      page: 1,
      pageSize: 10,
      projectId,
    });
    const detail = await caller.marketplace.getPackageDetail({
      packageId: 'pkg.persona-engine',
      projectId,
    });
    const feed = await caller.marketplace.getDiscoveryFeed({
      projectId,
      surface: 'discovery_card',
      signalRefs: ['persona'],
      limit: 5,
    });

    expect(browse.items).toHaveLength(1);
    expect(detail.package.package_id).toBe('pkg.persona-engine');
    expect(feed.cards).toHaveLength(1);
    expect(feed.cards[0].trustEligibility?.project_id).toBe(projectId);

    const suppression = await caller.marketplace.applyNudgeSuppression({
      candidateId: feed.cards[0].candidate.candidate_id,
      decisionId: feed.cards[0].decision.decision_id,
      action: 'dismiss_once',
      scope: 'candidate',
      targetRef: feed.cards[0].candidate.candidate_id,
      projectId,
      surface: 'discovery_card',
      evidenceRefs: [EVIDENCE_REF],
    });
    const blockedFeed = await caller.marketplace.getDiscoveryFeed({
      projectId,
      surface: 'discovery_card',
      signalRefs: ['persona'],
      limit: 5,
    });
    const acceptance = await caller.marketplace.routeNudgeAcceptance({
      candidate_id: feed.cards[0].candidate.candidate_id,
      decision_id: feed.cards[0].decision.decision_id,
      source_type: feed.cards[0].candidate.source_type,
      source_ref: feed.cards[0].candidate.source_ref,
      project_id: projectId,
      accepted_at: new Date().toISOString(),
      evidence_refs: [EVIDENCE_REF],
    });

    expect(suppression.action).toBe('dismiss_once');
    expect(blockedFeed.cards).toHaveLength(0);
    expect(blockedFeed.blockedDeliveries.length).toBeGreaterThan(0);
    expect(acceptance.route).toBe('runtime_authorization_required');

    await ctx.registryService.applyGovernanceAction({
      action_type: 'apply_moderation_action',
      package_id: submission.package.package_id,
      release_id: submission.release.release_id,
      actor_id: 'principal',
      reason_code: 'MKT-006-DISTRIBUTION_BLOCKED',
      target_distribution_status: 'hold',
      target_moderation_state: 'distribution_hold',
      approval_evidence_ref: 'approval:hold',
      evidence_refs: ['approval:hold'],
    });

    await ctx.registryService.submitAppeal({
      package_id: submission.package.package_id,
      release_id: submission.release.release_id,
      maintainer_id: 'maintainer:1',
      submitted_reason: 'Please review the hold',
      submitted_evidence_refs: ['appeal:1'],
    });

    const moderation = await caller.marketplace.getModerationDashboard({
      query: 'persona',
      statuses: [],
      includeResolvedAppeals: true,
    });

    expect(moderation.rows).toHaveLength(1);
  });
});
