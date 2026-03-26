'use client';

import * as React from 'react';
import type { MaoGridTileProjection, MaoProjectSnapshot } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';

function gridColumnsForDensity(
  densityMode: MaoProjectSnapshot['densityMode'],
): string {
  switch (densityMode) {
    case 'D0':
      return 'grid-cols-1';
    case 'D1':
      return 'grid-cols-1 md:grid-cols-2';
    case 'D2':
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
    case 'D3':
      return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
    case 'D4':
      return 'grid-cols-3 md:grid-cols-4 xl:grid-cols-6';
    default:
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
  }
}

function toneClasses(tile: MaoGridTileProjection): string {
  if (tile.agent.state === 'failed') {
    return 'border-red-500/40 bg-red-500/10';
  }
  if (tile.agent.state === 'blocked' || tile.agent.state === 'waiting_pfc') {
    return 'border-amber-500/40 bg-amber-500/10';
  }
  if (tile.agent.state === 'running' || tile.agent.state === 'resuming') {
    return 'border-emerald-500/40 bg-emerald-500/10';
  }
  if (tile.agent.state === 'completed') {
    return 'border-slate-500/40 bg-slate-500/10';
  }
  return 'border-border bg-background';
}

export interface MaoDensityGridProps {
  snapshot: MaoProjectSnapshot;
  selectedAgentId: string | null;
  onSelectTile: (tile: MaoGridTileProjection) => void;
}

export function MaoDensityGrid({
  snapshot,
  selectedAgentId,
  onSelectTile,
}: MaoDensityGridProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Density grid</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{snapshot.densityMode}</Badge>
            <Badge variant="outline">
              {snapshot.summary.activeAgentCount} active
            </Badge>
            <Badge variant="outline">
              {snapshot.summary.urgentAgentCount} urgent
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {!snapshot.grid.length ? (
          <p className="text-sm text-muted-foreground">
            No MAO agent projections are available for the selected project.
          </p>
        ) : (
          <div
            className={`grid gap-3 ${gridColumnsForDensity(snapshot.densityMode)}`}
          >
            {snapshot.grid.map((tile) => {
              const isSelected = selectedAgentId === tile.agent.agent_id;
              const urgent =
                snapshot.urgentOverlay.urgentAgentIds.includes(tile.agent.agent_id) ||
                tile.agent.urgency_level === 'urgent';
              const blocked = snapshot.urgentOverlay.blockedAgentIds.includes(
                tile.agent.agent_id,
              );

              return (
                <button
                  key={tile.agent.agent_id}
                  type="button"
                  aria-label={`Inspect ${tile.agent.current_step}`}
                  onClick={() => onSelectTile(tile)}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/20 ${
                    isSelected ? 'border-primary bg-primary/10' : toneClasses(tile)
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {tile.agent.current_step}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {tile.agent.dispatch_state}
                      </div>
                    </div>
                    <Badge variant="outline">{tile.agent.state}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{tile.agent.risk_level}</Badge>
                    <Badge variant="outline">{tile.agent.attention_level}</Badge>
                    {tile.inspectOnly ? (
                      <Badge variant="outline">inspect-first</Badge>
                    ) : null}
                    {urgent ? <Badge variant="outline">urgent</Badge> : null}
                    {blocked ? <Badge variant="outline">blocked</Badge> : null}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tile.agent.progress_percent}% complete</span>
                    <span>{tile.agent.reflection_cycle_count} review cycles</span>
                  </div>

                  {tile.agent.reasoning_log_preview ? (
                    <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                      {tile.agent.reasoning_log_preview.summary}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
