import type { MarketplaceNudgeCard, ProjectId } from '@nous/shared';
import type { CliTrpcClient } from '../trpc-client.js';

const CLI_EVIDENCE_REF = {
  actionCategory: 'trace-persist',
} as const;

export interface RunPkgDiscoverOptions {
  projectId?: string;
  limit?: number;
  signalRefs?: string[];
  json?: boolean;
  dismissCandidateId?: string;
  snoozeCandidateId?: string;
  muteCategoryCandidateId?: string;
  muteProjectCandidateId?: string;
  muteGlobalCandidateId?: string;
}

export interface RunPkgInstallOptions {
  projectId: string;
  releaseId?: string;
  versionRange?: string;
  json?: boolean;
}

function selectedSuppressionAction(options: RunPkgDiscoverOptions) {
  const selected = [
    options.dismissCandidateId
      ? { action: 'dismiss_once' as const, candidateId: options.dismissCandidateId }
      : null,
    options.snoozeCandidateId
      ? { action: 'snooze' as const, candidateId: options.snoozeCandidateId }
      : null,
    options.muteCategoryCandidateId
      ? { action: 'mute_category' as const, candidateId: options.muteCategoryCandidateId }
      : null,
    options.muteProjectCandidateId
      ? { action: 'mute_project' as const, candidateId: options.muteProjectCandidateId }
      : null,
    options.muteGlobalCandidateId
      ? { action: 'mute_global' as const, candidateId: options.muteGlobalCandidateId }
      : null,
  ].filter(
    (value): value is {
      action:
        | 'dismiss_once'
        | 'snooze'
        | 'mute_category'
        | 'mute_project'
        | 'mute_global';
      candidateId: string;
    } => value !== null,
  );

  if (selected.length > 1) {
    throw new Error('Select only one suppression action per discover invocation.');
  }

  return selected[0] ?? null;
}

export async function runPkgDiscover(
  client: CliTrpcClient,
  options: RunPkgDiscoverOptions,
): Promise<number> {
  try {
    const feed = await client.marketplace.getDiscoveryFeed.query({
      projectId: options.projectId as ProjectId | undefined,
      surface: 'cli_suggestion',
      signalRefs: options.signalRefs ?? [],
      limit: options.limit ?? 5,
    });

    await Promise.all(
      feed.cards.map((card: MarketplaceNudgeCard) =>
        client.marketplace.recordNudgeFeedback.mutate({
          candidateId: card.candidate.candidate_id,
          decisionId: card.decision.decision_id,
          deliveryId: card.delivery.delivery_id,
          eventType: 'opened',
          surface: 'cli_suggestion',
          evidenceRefs: [CLI_EVIDENCE_REF],
        }),
      ),
    );

    const suppression = selectedSuppressionAction(options);
    let suppressionResult: unknown = null;
    if (suppression) {
      const target = feed.cards.find(
        (card: MarketplaceNudgeCard) =>
          card.candidate.candidate_id === suppression.candidateId,
      );
      if (!target) {
        console.error(`Candidate not found in current feed: ${suppression.candidateId}`);
        return 1;
      }
      if (suppression.action === 'mute_project' && !options.projectId) {
        console.error('`--mute-project` requires `--project`.');
        return 1;
      }

      suppressionResult = await client.marketplace.applyNudgeSuppression.mutate({
        candidateId: target.candidate.candidate_id,
        decisionId: target.decision.decision_id,
        action: suppression.action,
        scope:
          suppression.action === 'mute_category'
            ? 'category'
            : suppression.action === 'mute_project'
              ? 'project'
              : suppression.action === 'mute_global'
                ? 'global'
                : 'candidate',
        targetRef:
          suppression.action === 'mute_category'
            ? target.candidate.source_type
            : suppression.action === 'mute_project'
              ? options.projectId!
              : suppression.action === 'mute_global'
                ? 'global'
                : target.candidate.candidate_id,
        projectId: options.projectId as ProjectId | undefined,
        surface: 'cli_suggestion',
        durationMinutes: suppression.action === 'snooze' ? 30 : undefined,
        evidenceRefs: [CLI_EVIDENCE_REF],
      });
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            feed,
            suppression: suppressionResult,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (feed.cards.length === 0) {
      console.log('No marketplace suggestions available.');
      return 0;
    }

    for (const card of feed.cards) {
      const trust = card.trustEligibility
        ? `${card.trustEligibility.distribution_status}/${card.trustEligibility.compatibility_state}`
        : 'n/a';
      console.log(
        `${card.candidate.candidate_id}\t${card.candidate.source_ref}\t${card.candidate.origin_trust_tier}\t${trust}`,
      );
      console.log(`  why: ${card.whyThis.join('; ')}`);
      console.log(`  suppress: ${card.availableSuppressionActions.join(', ')}`);
    }

    if (suppressionResult) {
      console.log('Applied suppression through canonical marketplace runtime.');
    }

    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export async function runPkgInstall(
  client: CliTrpcClient,
  packageId: string,
  options: RunPkgInstallOptions,
): Promise<number> {
  try {
    const result = await client.packages.install.mutate({
      project_id: options.projectId as ProjectId,
      package_id: packageId,
      release_id: options.releaseId,
      requested_version_range: options.versionRange,
      actor_id: 'cli',
      evidence_refs: ['cli:pkg-install'],
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return result.status === 'installed' ? 0 : 1;
    }

    if (result.status === 'installed') {
      console.log(`Installed ${packageId}`);
      console.log(`install order: ${result.resolution.install_order.join(', ')}`);
      return 0;
    }

    console.error(
      `${packageId} install ${result.status}: ${result.failure?.reason_code ?? 'unknown failure'}`,
    );
    if (result.failure?.detail) {
      console.error(result.failure.detail);
    }
    return 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
