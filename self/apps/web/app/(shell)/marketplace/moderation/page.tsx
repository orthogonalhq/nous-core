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
    <div className="space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Marketplace Moderation Dashboard</h1>
        <p className="text-sm text-muted-foreground">
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
