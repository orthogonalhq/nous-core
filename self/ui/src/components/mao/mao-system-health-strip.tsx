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

  return (
    <div
      className="flex flex-wrap gap-3"
      data-testid="system-health-strip"
    >
      <div className="rounded-md border border-border px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Total agents
        </div>
        <div className="mt-1 text-lg font-semibold" data-testid="total-agents">
          {totalAgents}
        </div>
      </div>

      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Active
        </div>
        <div className="mt-1 text-lg font-semibold" data-testid="active-agents">
          {activeCount}
        </div>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Blocked
        </div>
        <div className="mt-1 text-lg font-semibold" data-testid="blocked-agents">
          {blockedCount}
        </div>
      </div>

      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Failed
        </div>
        <div className="mt-1 text-lg font-semibold" data-testid="failed-agents">
          {failedCount}
        </div>
      </div>

      <div className="rounded-md border border-border px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Projects
        </div>
        <div className="mt-1 text-lg font-semibold" data-testid="project-count">
          {projectCount}
        </div>
      </div>

      <div className="rounded-md border border-border px-3 py-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Snapshot
        </div>
        <div className="mt-1 text-sm text-muted-foreground" data-testid="snapshot-freshness">
          {formatFreshness(snapshot.generatedAt)}
        </div>
      </div>
    </div>
  );
}
