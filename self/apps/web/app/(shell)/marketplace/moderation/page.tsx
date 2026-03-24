'use client';

import * as React from 'react';
import { MarketplaceModerationDashboard } from '@/components/marketplace/marketplace-moderation-dashboard';
import { trpc } from '@/lib/trpc';

export default function MarketplaceModerationPage() {
  const dashboardQuery = trpc.marketplace.getModerationDashboard.useQuery({
    query: '',
    statuses: [],
    includeResolvedAppeals: true,
  });

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
          Marketplace Moderation Dashboard
        </h1>
        <p
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Review canonical moderation posture, appeals, holds, delistings, and escalation continuity for registry packages.
        </p>
      </div>
      <MarketplaceModerationDashboard
        snapshot={dashboardQuery.data}
        isLoading={dashboardQuery.isLoading}
      />
    </div>
  );
}
