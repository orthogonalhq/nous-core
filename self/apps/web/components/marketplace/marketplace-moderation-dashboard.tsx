'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MarketplaceModerationDashboardSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const headerDividerStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--nous-shell-column-border)',
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-base)',
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-md)',
};

const contentStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-2xl)',
  paddingTop: 'var(--nous-space-2xl)',
};

const panelStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-2xl)',
};

const panelTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-xl)',
};

const actionLinkStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-xs) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
};

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

interface MarketplaceModerationDashboardProps {
  snapshot: MarketplaceModerationDashboardSnapshot | undefined;
  isLoading: boolean;
}

export function MarketplaceModerationDashboard({
  snapshot,
  isLoading,
}: MarketplaceModerationDashboardProps) {
  return (
    <Card>
      <CardHeader style={headerDividerStyle}>
        <CardTitle style={titleRowStyle}>
          <span>Moderation dashboard</span>
          <div style={rowWrapStyle}>
            <Badge variant="outline">pending appeals {snapshot?.pendingAppealCount ?? 0}</Badge>
            <Badge variant="outline">holds {snapshot?.activeHoldCount ?? 0}</Badge>
            <Badge variant="outline">delisted {snapshot?.delistedCount ?? 0}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent style={contentStackStyle}>
        {isLoading ? (
          <p style={mutedTextStyle}>Loading moderation dashboard...</p>
        ) : null}

        {(snapshot?.rows ?? []).map((row) => (
          <div key={row.package.package_id} style={panelStyle}>
            <div style={panelTitleRowStyle}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 'var(--nous-space-md)',
                  }}
                >
                  <h2
                    style={{
                      fontSize: 'var(--nous-font-size-base)',
                      fontWeight: 'var(--nous-font-weight-semibold)',
                    }}
                  >
                    {row.package.display_name}
                  </h2>
                  <Badge variant="outline">
                    {row.package.moderation_state ?? row.package.distribution_status}
                  </Badge>
                </div>
                <p
                  style={{
                    marginTop: 'var(--nous-space-xs)',
                    fontSize: 'var(--nous-font-size-sm)',
                    color: 'var(--nous-text-secondary)',
                  }}
                >
                  {row.package.package_id}
                </p>
                {row.latestAppeal ? (
                  <p
                    style={{
                      marginTop: 'var(--nous-space-md)',
                      fontSize: 'var(--nous-font-size-sm)',
                      color: 'var(--nous-text-secondary)',
                    }}
                  >
                    Latest appeal: {row.latestAppeal.status}
                  </p>
                ) : null}
              </div>

              <Link
                href={`/marketplace/${row.package.package_id}`}
                style={actionLinkStyle}
              >
                Inspect package
              </Link>
            </div>

            {row.latestGovernanceAction ? (
              <div
                style={{
                  marginTop: 'var(--nous-space-xl)',
                  borderRadius: 'var(--nous-radius-md)',
                  border: '1px solid var(--nous-shell-column-border)',
                  background: 'var(--nous-bg-hover)',
                  padding: 'var(--nous-space-md) var(--nous-space-xl)',
                  fontSize: 'var(--nous-font-size-sm)',
                  color: 'var(--nous-text-secondary)',
                }}
              >
                Latest governance action: {row.latestGovernanceAction.action_type} /
                {' '}
                {row.latestGovernanceAction.reason_code}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--nous-space-md)',
                marginTop: 'var(--nous-space-xl)',
              }}
            >
              {row.escalationIds.map((escalationId) => (
                <Badge key={escalationId} variant="outline">
                  escalation {String(escalationId).slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && (snapshot?.rows.length ?? 0) === 0 ? (
          <div
            style={{
              borderRadius: 'var(--nous-radius-md)',
              border: '1px dashed var(--nous-shell-column-border)',
              padding: 'var(--nous-space-3xl)',
              fontSize: 'var(--nous-font-size-sm)',
              color: 'var(--nous-text-secondary)',
            }}
          >
            No moderation rows match the current registry posture.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
