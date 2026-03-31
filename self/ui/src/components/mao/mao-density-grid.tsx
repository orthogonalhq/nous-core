'use client';

import * as React from 'react';
import type { MaoDensityMode, MaoGridTileProjection, MaoProjectSnapshot } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { resolveAgentLabel } from './mao-workflow-group-card';
import { getStateVisuals, CLUSTER_STATE_ORDER } from './mao-state-utils';

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

const streamingPulseStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: 'rgb(16 185 129)',
  animation: 'nous-streaming-pulse 1.2s ease-in-out infinite',
};

function renderInferenceInfo(
  tile: MaoGridTileProjection,
  densityMode: MaoDensityMode,
): React.ReactNode {
  if (!tile.agent.inference_provider_id) return null;
  if (densityMode === 'D3' || densityMode === 'D4') return null;

  const provider = tile.agent.inference_provider_id;
  const model = tile.agent.inference_model_id;
  const latency = tile.agent.inference_latency_ms;
  const tokens = tile.agent.inference_total_tokens;
  const isStreaming = tile.agent.inference_is_streaming;

  if (densityMode === 'D2') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="inference-d2">
        {isStreaming ? <span style={streamingPulseStyle} data-testid="streaming-pulse" /> : null}
        {tokens != null ? <span>{tokens.toLocaleString()} tok</span> : null}
      </div>
    );
  }

  // D0 and D1 share provider, model, latency, tokens
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid={`inference-${densityMode.toLowerCase()}`}>
      <span>{provider}</span>
      {model ? <span className="text-muted-foreground/70">{model}</span> : null}
      {latency != null ? (
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          {latency}ms
        </Badge>
      ) : null}
      {tokens != null ? <span>{tokens.toLocaleString()} tok</span> : null}
      {densityMode === 'D0' && isStreaming ? (
        <span style={streamingPulseStyle} data-testid="streaming-pulse" />
      ) : null}
    </div>
  );
}

/** Small SVG exclamation icon for urgent indicators at D3 */
function UrgentIcon() {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-red-500 shrink-0"
      data-testid="urgent-icon"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
      <text x="4" y="6" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">!</text>
    </svg>
  );
}

/** Elapsed-since-urgent timer for D0-D2 */
function UrgentTimer({ lastUpdateAt }: { lastUpdateAt: string }) {
  const [minutes, setMinutes] = React.useState(() =>
    Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 60000),
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMinutes(Math.floor((Date.now() - new Date(lastUpdateAt).getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [lastUpdateAt]);

  return (
    <span className="text-[10px] text-red-500" data-testid="urgent-timer">
      {minutes}m
    </span>
  );
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
  const { densityMode } = snapshot;

  // Sort tiles: urgent first, blocked second, then original order (D0-D3)
  const sortedTiles = React.useMemo(() => {
    return Array.from(snapshot.grid).sort((a, b) => {
      const aUrgent =
        snapshot.urgentOverlay.urgentAgentIds.includes(a.agent.agent_id) ||
        a.agent.urgency_level === 'urgent';
      const bUrgent =
        snapshot.urgentOverlay.urgentAgentIds.includes(b.agent.agent_id) ||
        b.agent.urgency_level === 'urgent';
      const aBlocked = snapshot.urgentOverlay.blockedAgentIds.includes(a.agent.agent_id);
      const bBlocked = snapshot.urgentOverlay.blockedAgentIds.includes(b.agent.agent_id);

      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      if (aBlocked && !bBlocked) return -1;
      if (!aBlocked && bBlocked) return 1;
      return 0;
    });
  }, [snapshot.grid, snapshot.urgentOverlay]);

  // D4 clustering: group tiles by lifecycle state
  const clusterMap = React.useMemo(() => {
    if (densityMode !== 'D4') return null;
    const map = new Map<string, MaoGridTileProjection[]>();
    for (const tile of snapshot.grid) {
      const state = tile.agent.state;
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(tile);
    }
    // Sort urgent to front within each cluster
    for (const tiles of map.values()) {
      tiles.sort((a, b) => {
        const aUrgent =
          snapshot.urgentOverlay.urgentAgentIds.includes(a.agent.agent_id) ||
          a.agent.urgency_level === 'urgent';
        const bUrgent =
          snapshot.urgentOverlay.urgentAgentIds.includes(b.agent.agent_id) ||
          b.agent.urgency_level === 'urgent';
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;
        return 0;
      });
    }
    return map;
  }, [snapshot.grid, snapshot.urgentOverlay, densityMode]);

  // Ordered cluster entries for D4
  const orderedClusters = React.useMemo(() => {
    if (!clusterMap) return null;
    return CLUSTER_STATE_ORDER
      .filter((state) => clusterMap.has(state))
      .map((state) => ({ state, tiles: clusterMap.get(state)! }));
  }, [clusterMap]);

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
        ) : densityMode === 'D4' && orderedClusters ? (
          /* D4 clustered rendering */
          <div className="space-y-3">
            {orderedClusters.map(({ state, tiles }) => (
              <div key={state} data-testid={`cluster-${state}`}>
                <div className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wider">
                  {state} ({tiles.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {tiles.map((tile) => {
                    const isSelected = selectedAgentId === tile.agent.agent_id;
                    const urgent =
                      snapshot.urgentOverlay.urgentAgentIds.includes(tile.agent.agent_id) ||
                      tile.agent.urgency_level === 'urgent';
                    const visuals = getStateVisuals(tile.agent.state);

                    return (
                      <button
                        key={tile.agent.agent_id}
                        type="button"
                        aria-label={`Inspect ${resolveAgentLabel(tile.agent)}`}
                        onClick={() => onSelectTile(tile)}
                        data-testid="density-tile-d4"
                        className={`w-6 h-6 rounded ${visuals.dot} ${
                          isSelected ? 'ring-2 ring-primary' : ''
                        } ${urgent ? 'ring-2 ring-red-500' : ''} ${visuals.pulse}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* D0-D3 flat rendering */
          <div
            className={`grid gap-3 ${gridColumnsForDensity(densityMode)}`}
          >
            {sortedTiles.map((tile) => {
              const isSelected = selectedAgentId === tile.agent.agent_id;
              const urgent =
                snapshot.urgentOverlay.urgentAgentIds.includes(tile.agent.agent_id) ||
                tile.agent.urgency_level === 'urgent';
              const blocked = snapshot.urgentOverlay.blockedAgentIds.includes(
                tile.agent.agent_id,
              );
              const visuals = getStateVisuals(tile.agent.state);

              /* D3 compact tile */
              if (densityMode === 'D3') {
                return (
                  <button
                    key={tile.agent.agent_id}
                    type="button"
                    aria-label={`Inspect ${resolveAgentLabel(tile.agent)}`}
                    onClick={() => onSelectTile(tile)}
                    data-testid="density-tile-d3"
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-xs transition-colors hover:bg-muted/30 ${
                      isSelected ? 'border-primary bg-primary/10' : visuals.tone
                    } ${urgent ? 'border-red-500 border-2' : ''} ${visuals.pulse}`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full ${visuals.dot}`} />
                    <span className="truncate max-w-16">{resolveAgentLabel(tile.agent).slice(0, 16)}</span>
                    {urgent && <UrgentIcon />}
                  </button>
                );
              }

              /* D0-D2 full card */
              return (
                <button
                  key={tile.agent.agent_id}
                  type="button"
                  aria-label={`Inspect ${tile.agent.current_step}`}
                  onClick={() => onSelectTile(tile)}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/20 ${
                    isSelected ? 'border-primary bg-primary/10' : visuals.tone
                  } ${urgent ? 'border-red-500 border-2' : ''} ${visuals.pulse}`}
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
                    {urgent ? (
                      <Badge
                        variant="outline"
                        className="border-red-500 text-red-500 bg-red-500/10"
                        data-testid="urgent-indicator"
                      >
                        URGENT
                      </Badge>
                    ) : null}
                    {blocked ? <Badge variant="outline">blocked</Badge> : null}
                  </div>

                  {urgent && tile.agent.last_update_at && (
                    <div className="mt-1">
                      <UrgentTimer lastUpdateAt={tile.agent.last_update_at} />
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tile.agent.progress_percent}% complete</span>
                    <span>{tile.agent.reflection_cycle_count} review cycles</span>
                  </div>

                  {renderInferenceInfo(tile, snapshot.densityMode)}

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
