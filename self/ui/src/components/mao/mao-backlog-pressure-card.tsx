'use client';

import * as React from 'react';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { useEventSubscription } from '../../hooks/useEventSubscription';
import { useMaoServices } from './mao-services-context';

const TREND_CONFIG = {
  increasing: {
    label: 'Increasing',
    arrow: '\u2191',
    className: 'border-red-500/40 bg-red-500/10 text-red-500',
  },
  stable: {
    label: 'Stable',
    arrow: '\u2192',
    className: 'border-border bg-background text-muted-foreground',
  },
  decreasing: {
    label: 'Decreasing',
    arrow: '\u2193',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  },
} as const;

export function MaoBacklogPressureCard() {
  const { useSystemStatusQuery, useInvalidation } = useMaoServices();
  const { systemStatusInvalidate } = useInvalidation();

  const statusQuery = useSystemStatusQuery(undefined);

  useEventSubscription({
    channels: ['mao:projection-changed'],
    onEvent: () => {
      void systemStatusInvalidate.invalidate();
    },
    enabled: true,
  });

  const backlog = statusQuery.data?.backlogAnalytics;
  const trend = backlog?.pressureTrend;
  const trendConfig = trend ? TREND_CONFIG[trend] : null;

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Backlog pressure</span>
          {trendConfig ? (
            <Badge
              variant="outline"
              className={trendConfig.className}
            >
              {trendConfig.arrow} {trendConfig.label}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 text-sm">
        {statusQuery.isLoading ? (
          <p className="text-muted-foreground">Loading system status...</p>
        ) : statusQuery.isError ? (
          <p className="text-muted-foreground">
            Failed to load system status.
          </p>
        ) : !backlog ? (
          <p className="text-muted-foreground">
            Backlog analytics are not available.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Queued
              </div>
              <div className="mt-1 text-lg font-semibold">
                {backlog.queuedCount}
              </div>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Active
              </div>
              <div className="mt-1 text-lg font-semibold">
                {backlog.activeCount}
              </div>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Suspended
              </div>
              <div className="mt-1 text-lg font-semibold">
                {backlog.suspendedCount}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
