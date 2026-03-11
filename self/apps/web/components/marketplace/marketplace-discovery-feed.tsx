'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  MarketplaceNudgeCard,
  MarketplaceNudgeFeedSnapshot,
  NudgeSuppressionAction,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarketplaceDiscoveryFeedProps {
  snapshot: MarketplaceNudgeFeedSnapshot | undefined;
  isLoading: boolean;
  onRecordOpened: (card: MarketplaceNudgeCard) => void;
  onRouteAcceptance: (card: MarketplaceNudgeCard) => void;
  onSuppress: (card: MarketplaceNudgeCard, action: NudgeSuppressionAction) => void;
}

function projectLink(card: MarketplaceNudgeCard) {
  const link = card.deepLinks.find((candidate) => candidate.target === 'projects');
  if (!link?.projectId) {
    return null;
  }

  const params = new URLSearchParams({
    source: 'marketplace',
    projectId: link.projectId,
    packageId: link.packageId,
  });
  if (link.releaseId) {
    params.set('releaseId', link.releaseId);
  }
  if (link.candidateId) {
    params.set('candidateId', link.candidateId);
  }
  if (link.evidenceRef) {
    params.set('evidenceRef', link.evidenceRef);
  }
  return `/projects?${params.toString()}`;
}

function maoLink(card: MarketplaceNudgeCard) {
  const link = card.deepLinks.find((candidate) => candidate.target === 'mao');
  if (!link?.projectId) {
    return null;
  }

  const params = new URLSearchParams({
    source: 'marketplace',
    projectId: link.projectId,
    packageId: link.packageId,
  });
  if (link.releaseId) {
    params.set('releaseId', link.releaseId);
  }
  if (link.candidateId) {
    params.set('candidateId', link.candidateId);
  }
  if (link.evidenceRef) {
    params.set('evidenceRef', link.evidenceRef);
  }
  return `/mao?${params.toString()}`;
}

export function MarketplaceDiscoveryFeed({
  snapshot,
  isLoading,
  onRecordOpened,
  onRouteAcceptance,
  onSuppress,
}: MarketplaceDiscoveryFeedProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Discovery feed</span>
          <Badge variant="outline">{snapshot?.surface ?? 'discovery_card'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Preparing advisory feed...</p>
        ) : null}

        {(snapshot?.cards ?? []).map((card) => {
          const projectsHref = projectLink(card);
          const maoHref = maoLink(card);
          return (
            <div
              key={card.candidate.candidate_id}
              className="rounded-md border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {card.candidate.source_ref}
                    </h2>
                    <Badge variant="outline">{card.candidate.origin_trust_tier}</Badge>
                    <Badge variant="outline">{card.candidate.compatibility_state}</Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {card.whyThis.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/marketplace/${card.candidate.source_ref}`}
                    onClick={() => onRecordOpened(card)}
                    className="rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted/20"
                  >
                    Open package
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => onRouteAcceptance(card)}>
                    Route suggestion
                  </Button>
                </div>
              </div>

              {card.trustEligibility ? (
                <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  Trust eligibility: {card.trustEligibility.distribution_status} /
                  {' '}
                  {card.trustEligibility.compatibility_state}
                  {card.trustEligibility.block_reason_codes.length > 0
                    ? ` (${card.trustEligibility.block_reason_codes.join(', ')})`
                    : ''}
                </div>
              ) : null}

              {projectsHref || maoHref ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {projectsHref ? (
                    <Link
                      href={projectsHref}
                      className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/20"
                    >
                      Open Projects
                    </Link>
                  ) : null}
                  {maoHref ? (
                    <Link
                      href={maoHref}
                      className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/20"
                    >
                      Open MAO
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onSuppress(card, 'dismiss_once')}>
                  Dismiss once
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSuppress(card, 'snooze')}>
                  Snooze 30m
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSuppress(card, 'mute_category')}>
                  Mute category
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSuppress(card, 'mute_project')}>
                  Mute project
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSuppress(card, 'mute_global')}>
                  Mute global
                </Button>
              </div>
            </div>
          );
        })}

        {!isLoading && (snapshot?.cards.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No active advisory suggestions are available for the current project and signal posture.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
