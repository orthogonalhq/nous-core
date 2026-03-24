'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MarketplaceNudgeCard, NudgeSuppressionAction } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { MarketplaceBrowser } from '@/components/marketplace/marketplace-browser';
import { MarketplaceDiscoveryFeed } from '@/components/marketplace/marketplace-discovery-feed';
import { useEventSubscription } from '@nous/ui';
import { useProject } from '@/lib/project-context';
import { trpc } from '@/lib/trpc';
import { useSearchParams } from 'next/navigation';

const UI_EVIDENCE_REF = {
  actionCategory: 'trace-persist',
} as const;

export default function MarketplacePage() {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading marketplace surface...</p>
        </div>
      }
    >
      <MarketplacePageContent />
    </React.Suspense>
  );
}

function MarketplacePageContent() {
  const { projectId, setProjectId } = useProject();
  const searchParams = useSearchParams();
  const linkedProjectId = searchParams.get('projectId');
  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const utils = trpc.useUtils();

  useEventSubscription({
    channels: ['lifecycle:transition'],
    onEvent: () => {
      void utils.marketplace.browsePackages.invalidate();
    },
  });

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [linkedProjectId, projectId, setProjectId]);

  const browseQuery = trpc.marketplace.browsePackages.useQuery({
    query: deferredQuery,
    trustTiers: [],
    distributionStatuses: [],
    compatibilityStates: [],
    page: 1,
    pageSize: 12,
    projectId: projectId ?? undefined,
  });
  const feedQuery = trpc.marketplace.getDiscoveryFeed.useQuery({
    projectId: projectId ?? undefined,
    surface: 'discovery_card',
    signalRefs: deferredQuery ? [deferredQuery] : [],
    limit: 5,
  });
  const recordFeedback = trpc.marketplace.recordNudgeFeedback.useMutation();
  const routeAcceptance = trpc.marketplace.routeNudgeAcceptance.useMutation();
  const applySuppression = trpc.marketplace.applyNudgeSuppression.useMutation({
    onSuccess: async () => {
      await utils.marketplace.getDiscoveryFeed.invalidate();
    },
  });

  const handleRecordOpened = (card: MarketplaceNudgeCard) => {
    recordFeedback.mutate({
      candidateId: card.candidate.candidate_id,
      decisionId: card.decision.decision_id,
      deliveryId: card.delivery.delivery_id,
      eventType: 'opened',
      surface: 'discovery_card',
      evidenceRefs: [UI_EVIDENCE_REF],
    });
  };

  const handleRouteAcceptance = (card: MarketplaceNudgeCard) => {
    routeAcceptance.mutate({
      candidate_id: card.candidate.candidate_id,
      decision_id: card.decision.decision_id,
      source_type: card.candidate.source_type,
      source_ref: card.candidate.source_ref,
      project_id: projectId ?? undefined,
      accepted_at: new Date().toISOString(),
      evidence_refs: [UI_EVIDENCE_REF],
    });
  };

  const handleSuppress = (
    card: MarketplaceNudgeCard,
    action: NudgeSuppressionAction,
  ) => {
    const targetRef =
      action === 'mute_category'
        ? card.candidate.source_type
        : action === 'mute_project'
          ? (projectId ?? 'global')
          : action === 'mute_global'
            ? 'global'
            : card.candidate.candidate_id;
    const scope =
      action === 'mute_category'
        ? 'category'
        : action === 'mute_project'
          ? 'project'
          : action === 'mute_global'
            ? 'global'
            : 'candidate';

    applySuppression.mutate({
      candidateId: card.candidate.candidate_id,
      decisionId: card.decision.decision_id,
      action,
      scope,
      targetRef,
      projectId: projectId ?? undefined,
      surface: 'discovery_card',
      durationMinutes: action === 'snooze' ? 30 : undefined,
      evidenceRefs: [UI_EVIDENCE_REF],
      occurredAt: new Date().toISOString(),
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-3xl)',
        padding: 'var(--nous-space-4xl)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--nous-space-2xl)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--nous-space-xs)',
          }}
        >
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 'var(--nous-font-weight-semibold)',
            }}
          >
            Marketplace Governance Surface
          </h1>
          <p
            style={{
              fontSize: 'var(--nous-font-size-sm)',
              color: 'var(--nous-text-secondary)',
            }}
          >
            Browse canonical registry truth, inspect moderation posture, and review advisory discovery nudges without creating UI-owned governance or suppression state.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--nous-space-md)',
          }}
        >
          {projectId ? <Badge variant="outline">project {projectId.slice(0, 8)}</Badge> : null}
          <Link
            href="/marketplace/moderation"
            style={{
              borderRadius: 'var(--nous-radius-md)',
              border: '1px solid var(--nous-shell-column-border)',
              padding: 'var(--nous-space-xs) var(--nous-space-xl)',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Open moderation dashboard
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 'var(--nous-space-3xl)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))',
        }}
      >
        <MarketplaceBrowser
          query={query}
          onQueryChange={setQuery}
          snapshot={browseQuery.data}
          isLoading={browseQuery.isLoading}
          projectId={projectId}
        />
        <MarketplaceDiscoveryFeed
          snapshot={feedQuery.data}
          isLoading={feedQuery.isLoading}
          onRecordOpened={handleRecordOpened}
          onRouteAcceptance={handleRouteAcceptance}
          onSuppress={handleSuppress}
        />
      </div>
    </div>
  );
}
