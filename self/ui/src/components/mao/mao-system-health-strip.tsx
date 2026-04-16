'use client';

import * as React from 'react';
import type { MaoSystemSnapshot } from '@nous/shared';

export interface MaoSystemHealthStripProps {
  snapshot: MaoSystemSnapshot;
}

function formatFreshness(generatedAt: string): string {
  const now = Date.now();
  const then = new Date(generatedAt).getTime();
  const diffMs = now - then;

  if (diffMs < 1000) return 'just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return `${Math.floor(diffMs / 3_600_000)}h ago`;
}

export function MaoSystemHealthStrip({ snapshot }: MaoSystemHealthStripProps) {
  const totalAgents = snapshot.agents.length;
  const activeCount = snapshot.agents.filter(
    (a) => a.state === 'running' || a.state === 'resuming',
  ).length;
  const blockedCount = snapshot.agents.filter(
    (a) => a.state === 'blocked' || a.state === 'waiting_pfc',
  ).length;
  const failedCount = snapshot.agents.filter(
    (a) => a.state === 'failed',
  ).length;
  const projectCount = Object.keys(snapshot.projectControls).length;

  const cellBase: React.CSSProperties = {
    borderRadius: 'var(--nous-radius-sm)',
    border: '1px solid var(--nous-border-subtle)',
    paddingInline: 'var(--nous-space-md)',
    paddingBlock: 'var(--nous-space-sm)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--nous-font-size-xs)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--nous-fg-muted)',
  };

  const valueStyle: React.CSSProperties = {
    marginTop: 'var(--nous-space-2xs)',
    fontSize: 'var(--nous-font-size-lg)',
    fontWeight: 600,
  };

  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-md)' }}
      data-testid="system-health-strip"
    >
      <div style={cellBase}>
        <div style={labelStyle}>Total agents</div>
        <div style={valueStyle} data-testid="total-agents">{totalAgents}</div>
      </div>

      <div style={{ ...cellBase, borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.1)' }}>
        <div style={labelStyle}>Active</div>
        <div style={valueStyle} data-testid="active-agents">{activeCount}</div>
      </div>

      <div style={{ ...cellBase, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.1)' }}>
        <div style={labelStyle}>Blocked</div>
        <div style={valueStyle} data-testid="blocked-agents">{blockedCount}</div>
      </div>

      <div style={{ ...cellBase, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' }}>
        <div style={labelStyle}>Failed</div>
        <div style={valueStyle} data-testid="failed-agents">{failedCount}</div>
      </div>

      <div style={cellBase}>
        <div style={labelStyle}>Projects</div>
        <div style={valueStyle} data-testid="project-count">{projectCount}</div>
      </div>

      <div style={cellBase}>
        <div style={labelStyle}>Snapshot</div>
        <div
          style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}
          data-testid="snapshot-freshness"
        >
          {formatFreshness(snapshot.generatedAt)}
        </div>
      </div>
    </div>
  );
}
