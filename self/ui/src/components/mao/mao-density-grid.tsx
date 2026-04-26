'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import type { MaoDensityMode, MaoGridTileProjection, MaoProjectSnapshot } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { resolveAgentLabel } from './mao-workflow-group-card';
import { getStateVisuals, CLUSTER_STATE_ORDER } from './mao-state-utils';

/** Single-column layout since MAO renders at 280-400px where breakpoints never trigger */
function gridStyleForDensity(densityMode: MaoProjectSnapshot['densityMode']): CSSProperties {
  switch (densityMode) {
    case 'D0':
    case 'D1':
      return { display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' };
    case 'D2':
      return { display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' };
    case 'D3':
      return { display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-md)' };
    case 'D4':
      return { display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-md)' };
    default:
      return { display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' };
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

/**
 * SUPV-SP13-007 — Hover/focus/click affordance polish via design-system
 * tokens. Closed-form CSS pseudo-class rules; no JS-based hover detection.
 * SUPV-SP13-008 — D3/D4 inspect-only static cue (no animation, no
 * attention-getter heuristic). SUPV-SP13-009 — urgent overlay visibility
 * unconditional on motion preference; only `animation`/`transition` are
 * suppressed under reduced-motion (visibility itself is not conditional).
 * Per `feedback_no_heuristic_bandaids.md` "design-system token-driven;
 * closed-form".
 */
const DENSITY_GRID_STYLE_ID = 'mao-density-grid-affordance';
const DENSITY_GRID_CSS = `
[data-mao-tile]:hover {
  background-color: var(--nous-state-active-tone-bg);
}
[data-mao-tile]:focus-visible {
  outline: 2px solid var(--nous-border-focus);
  outline-offset: 2px;
}
[data-mao-tile]:active {
  background-color: var(--nous-state-active-tone-bg);
  transform: scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  [data-mao-tile] {
    transition: none;
  }
  [data-mao-tile]:active {
    transform: none;
  }
  [data-mao-urgent-indicator],
  [data-testid="urgent-indicator"],
  [data-testid="urgent-icon"] {
    animation: none;
    transition: none;
  }
}
`;

const D3_D4_CUE_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 4,
  right: 4,
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-muted)',
  background: 'var(--nous-bg-card)',
  border: '1px solid var(--nous-border-subtle)',
  paddingInline: 2,
  borderRadius: 'var(--nous-radius-xs)',
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

  const inferenceRowStyle: CSSProperties = {
    marginTop: 'var(--nous-space-sm)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    fontSize: 'var(--nous-font-size-xs)',
    color: 'var(--nous-fg-muted)',
  };

  if (densityMode === 'D2') {
    return (
      <div style={inferenceRowStyle} data-testid="inference-d2">
        {isStreaming ? <span style={streamingPulseStyle} data-testid="streaming-pulse" /> : null}
        {tokens != null ? <span>{tokens.toLocaleString()} tok</span> : null}
      </div>
    );
  }

  // D0 and D1 share provider, model, latency, tokens
  return (
    <div style={inferenceRowStyle} data-testid={`inference-${densityMode.toLowerCase()}`}>
      <span>{provider}</span>
      {model ? <span style={{ opacity: 0.7 }}>{model}</span> : null}
      {latency != null ? (
        <Badge variant="outline" style={{ fontSize: '10px', paddingInline: 'var(--nous-space-2xs)', paddingBlock: 0 }}>
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
      style={{ color: '#ef4444', flexShrink: 0 }}
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
    <span style={{ fontSize: '10px', color: '#ef4444' }} data-testid="urgent-timer">
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
      <style data-style-id={DENSITY_GRID_STYLE_ID}>{DENSITY_GRID_CSS}</style>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Density grid</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
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
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-lg)', paddingTop: 'var(--nous-space-lg)' }}>
        {!snapshot.grid.length ? (
          <p style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
            No MAO agent projections are available for the selected project.
          </p>
        ) : densityMode === 'D4' && orderedClusters ? (
          /* D4 clustered rendering */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' }}>
            {orderedClusters.map(({ state, tiles }) => (
              <div key={state} data-testid={`cluster-${state}`}>
                <div style={{ fontSize: '10px', color: 'var(--nous-fg-muted)', fontWeight: 500, marginBottom: 'var(--nous-space-2xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {state} ({tiles.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xs)' }}>
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
                        data-mao-tile="D4"
                        data-mao-density="D4"
                        className={visuals.pulse || undefined}
                        style={{
                          position: 'relative',
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: 'var(--nous-radius-xs)',
                          ...visuals.dotStyle,
                          ...(isSelected ? { boxShadow: '0 0 0 2px var(--nous-accent)' } : {}),
                          ...(urgent ? { boxShadow: '0 0 0 2px #ef4444' } : {}),
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* D0-D3 flat rendering */
          <div style={gridStyleForDensity(densityMode)}>
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
                    data-mao-tile="D3"
                    data-mao-density="D3"
                    className={visuals.pulse || undefined}
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--nous-space-2xs)',
                      borderRadius: 'var(--nous-radius-xs)',
                      border: '1px solid',
                      paddingInline: '6px',
                      paddingBlock: 'var(--nous-space-2xs)',
                      paddingRight: 'calc(6px + var(--nous-space-md))',
                      fontSize: 'var(--nous-font-size-xs)',
                      transition: 'background-color 0.15s',
                      ...(isSelected
                        ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                        : visuals.toneStyle),
                      ...(urgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                    }}
                  >
                    <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...visuals.dotStyle }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '4rem' }}>{resolveAgentLabel(tile.agent).slice(0, 16)}</span>
                    {urgent && <UrgentIcon />}
                    {/*
                      * SUPV-SP13-008 — D3/D4 inspect-only static cue. Static
                      * visibility, no animation. Per
                      * `feedback_no_heuristic_bandaids.md` "explicit static
                      * visibility per density mode; no animated attention-getter."
                      */}
                    <span data-mao-cue="tap-to-inspect" style={D3_D4_CUE_STYLE} aria-hidden="true">
                      tap
                    </span>
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
                  data-mao-tile={densityMode}
                  data-mao-density={densityMode}
                  className={visuals.pulse || undefined}
                  style={{
                    borderRadius: 'var(--nous-radius-md)',
                    border: '1px solid',
                    padding: 'var(--nous-space-xl)',
                    textAlign: 'left',
                    transition: 'background-color 0.15s',
                    ...(isSelected
                      ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                      : visuals.toneStyle),
                    ...(urgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>
                        {tile.agent.current_step}
                      </div>
                      <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                        {tile.agent.dispatch_state}
                      </div>
                    </div>
                    <Badge variant="outline">{tile.agent.state}</Badge>
                  </div>

                  <div style={{ marginTop: 'var(--nous-space-xl)', display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-xs)' }}>
                    <Badge variant="outline">{tile.agent.risk_level}</Badge>
                    <Badge variant="outline">{tile.agent.attention_level}</Badge>
                    {tile.inspectOnly ? (
                      <Badge variant="outline">inspect-first</Badge>
                    ) : null}
                    {urgent ? (
                      <Badge
                        variant="outline"
                        style={{ borderColor: '#ef4444', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }}
                        data-testid="urgent-indicator"
                        data-mao-urgent-indicator="present"
                      >
                        URGENT
                      </Badge>
                    ) : null}
                    {blocked ? <Badge variant="outline">blocked</Badge> : null}
                  </div>

                  {urgent && tile.agent.last_update_at && (
                    <div style={{ marginTop: 'var(--nous-space-2xs)' }}>
                      <UrgentTimer lastUpdateAt={tile.agent.last_update_at} />
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--nous-space-xl)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    <span>{tile.agent.progress_percent}% complete</span>
                    <span>{tile.agent.reflection_cycle_count} review cycles</span>
                  </div>

                  {renderInferenceInfo(tile, snapshot.densityMode)}

                  {tile.agent.reasoning_log_preview ? (
                    <p style={{ marginTop: 'var(--nous-space-xl)', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
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
