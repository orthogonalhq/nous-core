'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { trpc, useEventSubscription } from '@nous/transport';

const TREND_CONFIG: Record<string, { label: string; arrow: string; style: CSSProperties }> = {
  increasing: {
    label: 'Increasing',
    arrow: '\u2191',
    style: { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  },
  stable: {
    label: 'Stable',
    arrow: '\u2192',
    style: { borderColor: 'var(--nous-border-subtle)', backgroundColor: 'var(--nous-bg)', color: 'var(--nous-fg-muted)' },
  },
  decreasing: {
    label: 'Decreasing',
    arrow: '\u2193',
    style: { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' },
  },
};

export function MaoBacklogPressureCard() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.health.systemStatus.useQuery();

  // WR-162 SP 1.16 (SUPV-SP1.16-008) — RC-1b first-data gate. SSE events
  // arriving before the initial query resolves are absorbed by the initial
  // fetch; invalidating before first data feeds the hydration-window
  // batch-tick cascade (BT R1 32× amplifier).
  useEventSubscription({
    channels: ['mao:projection-changed'],
    onEvent: () => {
      if (statusQuery.data === undefined) return;
      void utils.health.systemStatus.invalidate();
    },
    enabled: true,
  });

  const backlog = statusQuery.data?.backlogAnalytics;
  const trend = backlog?.pressureTrend;
  const trendConfig = trend ? TREND_CONFIG[trend] : null;

  const cellBase: CSSProperties = {
    borderRadius: 'var(--nous-radius-sm)',
    border: '1px solid var(--nous-border-subtle)',
    paddingInline: 'var(--nous-space-md)',
    paddingBlock: 'var(--nous-space-sm)',
  };

  const labelStyle: CSSProperties = {
    fontSize: 'var(--nous-font-size-xs)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--nous-fg-muted)',
  };

  const valueStyle: CSSProperties = {
    marginTop: 'var(--nous-space-2xs)',
    fontSize: 'var(--nous-font-size-lg)',
    fontWeight: 600,
  };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Backlog pressure</span>
          {trendConfig ? (
            <Badge variant="outline" style={trendConfig.style}>
              {trendConfig.arrow} {trendConfig.label}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)', paddingTop: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
        {statusQuery.isLoading ? (
          <p style={{ color: 'var(--nous-fg-muted)' }}>Loading system status...</p>
        ) : statusQuery.isError ? (
          <p style={{ color: 'var(--nous-fg-muted)' }}>
            Failed to load system status.
          </p>
        ) : !backlog ? (
          <p style={{ color: 'var(--nous-fg-muted)' }}>
            Backlog analytics are not available.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' }}>
            <div style={cellBase}>
              <div style={labelStyle}>Queued</div>
              <div style={valueStyle}>{backlog.queuedCount}</div>
            </div>
            <div style={cellBase}>
              <div style={labelStyle}>Active</div>
              <div style={valueStyle}>{backlog.activeCount}</div>
            </div>
            <div style={cellBase}>
              <div style={labelStyle}>Suspended</div>
              <div style={valueStyle}>{backlog.suspendedCount}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
