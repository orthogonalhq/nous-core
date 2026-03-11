'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MarketplaceModerationDashboardSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <CardHeader className="border-b border-border">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span>Moderation dashboard</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">pending appeals {snapshot?.pendingAppealCount ?? 0}</Badge>
            <Badge variant="outline">holds {snapshot?.activeHoldCount ?? 0}</Badge>
            <Badge variant="outline">delisted {snapshot?.delistedCount ?? 0}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading moderation dashboard...</p>
        ) : null}

        {(snapshot?.rows ?? []).map((row) => (
          <div key={row.package.package_id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{row.package.display_name}</h2>
                  <Badge variant="outline">
                    {row.package.moderation_state ?? row.package.distribution_status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.package.package_id}
                </p>
                {row.latestAppeal ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Latest appeal: {row.latestAppeal.status}
                  </p>
                ) : null}
              </div>

              <Link
                href={`/marketplace/${row.package.package_id}`}
                className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/20"
              >
                Inspect package
              </Link>
            </div>

            {row.latestGovernanceAction ? (
              <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Latest governance action: {row.latestGovernanceAction.action_type} /
                {' '}
                {row.latestGovernanceAction.reason_code}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {row.escalationIds.map((escalationId) => (
                <Badge key={escalationId} variant="outline">
                  escalation {String(escalationId).slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        {!isLoading && (snapshot?.rows.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No moderation rows match the current registry posture.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
