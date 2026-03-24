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

const cardHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--nous-shell-column-border)',
};

const cardTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: 'var(--nous-font-size-base)',
};

const contentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
  paddingTop: 'var(--nous-space-md)',
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-xs)',
};

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

const itemCardStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-md)',
};

const itemHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
};

const itemTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)',
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-base)',
  fontWeight: 'var(--nous-font-weight-semibold)',
};

const actionLinkStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
};

const prominentActionLinkStyle: React.CSSProperties = {
  ...actionLinkStyle,
  fontWeight: 'var(--nous-font-weight-medium)',
};

const detailBoxStyle: React.CSSProperties = {
  marginTop: '12px',
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  background: 'var(--nous-bg-hover)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

const emptyStateStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px dashed var(--nous-shell-column-border)',
  padding: 'var(--nous-space-3xl)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

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
      <CardHeader style={cardHeaderStyle}>
        <CardTitle style={cardTitleStyle}>
          <span>Discovery feed</span>
          <Badge variant="outline">{snapshot?.surface ?? 'discovery_card'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent style={contentStyle}>
        {isLoading ? <p style={mutedTextStyle}>Preparing advisory feed...</p> : null}

        {(snapshot?.cards ?? []).map((card) => {
          const projectsHref = projectLink(card);
          const maoHref = maoLink(card);

          return (
            <div key={card.candidate.candidate_id} style={itemCardStyle}>
              <div style={itemHeaderStyle}>
                <div>
                  <div style={itemTitleRowStyle}>
                    <h2 style={itemTitleStyle}>{card.candidate.source_ref}</h2>
                    <Badge variant="outline">{card.candidate.origin_trust_tier}</Badge>
                    <Badge variant="outline">{card.candidate.compatibility_state}</Badge>
                  </div>
                  <ul
                    style={{
                      marginTop: 'var(--nous-space-xs)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: 'var(--nous-font-size-sm)',
                      color: 'var(--nous-text-secondary)',
                      paddingLeft: '1.25rem',
                    }}
                  >
                    {card.whyThis.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div style={rowWrapStyle}>
                  <Link
                    href={`/marketplace/${card.candidate.source_ref}`}
                    onClick={() => onRecordOpened(card)}
                    style={prominentActionLinkStyle}
                  >
                    Open package
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => onRouteAcceptance(card)}>
                    Route suggestion
                  </Button>
                </div>
              </div>

              {card.trustEligibility ? (
                <div style={detailBoxStyle}>
                  Trust eligibility: {card.trustEligibility.distribution_status} /{' '}
                  {card.trustEligibility.compatibility_state}
                  {card.trustEligibility.block_reason_codes.length > 0
                    ? ` (${card.trustEligibility.block_reason_codes.join(', ')})`
                    : ''}
                </div>
              ) : null}

              {projectsHref || maoHref ? (
                <div style={{ ...rowWrapStyle, marginTop: '12px' }}>
                  {projectsHref ? (
                    <Link href={projectsHref} style={actionLinkStyle}>
                      Open Projects
                    </Link>
                  ) : null}
                  {maoHref ? (
                    <Link href={maoHref} style={actionLinkStyle}>
                      Open MAO
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div style={{ ...rowWrapStyle, marginTop: '12px' }}>
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
          <div style={emptyStateStyle}>
            No active advisory suggestions are available for the current project and signal posture.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
