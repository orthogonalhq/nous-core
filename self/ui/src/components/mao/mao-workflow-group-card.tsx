'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import type { MaoAgentProjection, MaoDensityMode } from '@nous/shared';
import { getStateVisuals } from './mao-state-utils';

/** Agent class color mapping for edge connectors and tile accents */
export interface AgentClassColor {
  /** SVG stroke color value */
  strokeColor: string;
  /** Inline style for tile fill surface */
  fillStyle: CSSProperties;
  label: string;
}

export const AGENT_CLASS_COLORS: Record<string, AgentClassColor> = {
  'Cortex::Principal': {
    strokeColor: '#3b82f6',
    fillStyle: { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.4)' },
    label: 'Principal',
  },
  'Cortex::System': {
    strokeColor: '#8b5cf6',
    fillStyle: { backgroundColor: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.4)' },
    label: 'System',
  },
  Orchestrator: {
    strokeColor: '#f59e0b',
    fillStyle: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.4)' },
    label: 'Orchestrator',
  },
  Worker: {
    strokeColor: '#10b981',
    fillStyle: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.4)' },
    label: 'Worker',
  },
};

export const FALLBACK_CLASS_COLOR: AgentClassColor = {
  strokeColor: '#94a3b8',
  fillStyle: { backgroundColor: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.4)' },
  label: 'Agent',
};

/** Resolve a display label for an agent using the priority chain */
export function resolveAgentLabel(agent: MaoAgentProjection): string {
  return (
    agent.display_name ??
    agent.current_step ??
    AGENT_CLASS_COLORS[agent.agent_class ?? '']?.label ??
    'Agent'
  );
}

function getClassColor(agent: MaoAgentProjection): AgentClassColor {
  return AGENT_CLASS_COLORS[agent.agent_class ?? ''] ?? FALLBACK_CLASS_COLOR;
}

function tileSizeStyle(densityMode: MaoDensityMode): CSSProperties {
  switch (densityMode) {
    case 'D0':
    case 'D1':
      return { minWidth: '16rem', padding: 'var(--nous-space-2xl)' };
    case 'D2':
      return { minWidth: '12rem', padding: 'var(--nous-space-xl)' };
    case 'D3':
      return { minWidth: '4rem', padding: '6px' };
    case 'D4':
      return { width: '1.5rem', height: '1.5rem' };
    default:
      return { minWidth: '12rem', padding: 'var(--nous-space-xl)' };
  }
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
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
      <text x="4" y="6" textAnchor="middle" fontSize="6" fill="white" fontWeight="bold">!</text>
    </svg>
  );
}

export interface MaoWorkflowGroupCardProps {
  orchestrator: MaoAgentProjection;
  workers: MaoAgentProjection[];
  densityMode: MaoDensityMode;
  selectedAgentId: string | null;
  onSelectAgent: (agent: MaoAgentProjection) => void;
}

export function MaoWorkflowGroupCard({
  orchestrator,
  workers,
  densityMode,
  selectedAgentId,
  onSelectAgent,
}: MaoWorkflowGroupCardProps) {
  const classColor = getClassColor(orchestrator);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (densityMode === 'D4') {
    return (
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--nous-radius-xs)',
          border: '1px solid',
          padding: 'var(--nous-space-2xs)',
          ...classColor.fillStyle,
        }}
        data-testid="workflow-group-card"
      >
        {/* Orchestrator tile — D4 with hover-expand to D3 */}
        {(() => {
          const isHovered = hoveredId === orchestrator.agent_id;
          const orchVisuals = getStateVisuals(orchestrator.state);
          const orchUrgent = orchestrator.urgency_level === 'urgent';

          if (isHovered) {
            return (
              <button
                type="button"
                data-agent-id={orchestrator.agent_id}
                onClick={() => onSelectAgent(orchestrator)}
                className={orchVisuals.pulse || undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--nous-space-2xs)',
                  borderRadius: 'var(--nous-radius-xs)',
                  paddingInline: 'var(--nous-space-2xs)',
                  paddingBlock: '2px',
                  fontSize: 'var(--nous-font-size-xs)',
                  fontWeight: 500,
                  transition: 'background-color 0.15s',
                  ...(selectedAgentId === orchestrator.agent_id ? { boxShadow: '0 0 0 1px var(--nous-accent)' } : {}),
                  ...(orchUrgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                }}
                aria-label={resolveAgentLabel(orchestrator)}
                onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
                onMouseLeave={() => setHoveredId(null)}
                data-testid="hover-expand-tile"
              >
                <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...orchVisuals.dotStyle }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '6rem' }}>
                  {resolveAgentLabel(orchestrator)}
                </span>
                {orchUrgent && <UrgentIcon />}
              </button>
            );
          }

          return (
            <button
              type="button"
              data-agent-id={orchestrator.agent_id}
              onClick={() => onSelectAgent(orchestrator)}
              className={orchVisuals.pulse || undefined}
              style={{
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: 'var(--nous-radius-xs)',
                ...orchVisuals.dotStyle,
                ...(selectedAgentId === orchestrator.agent_id ? { boxShadow: '0 0 0 2px var(--nous-accent)' } : {}),
                ...(orchUrgent ? { boxShadow: '0 0 0 2px #ef4444' } : {}),
              }}
              aria-label={resolveAgentLabel(orchestrator)}
              onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          );
        })()}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginTop: '2px' }}>
          {workers.map((w) => {
            const isHovered = hoveredId === w.agent_id;
            const wVisuals = getStateVisuals(w.state);
            const wUrgent = w.urgency_level === 'urgent';

            if (isHovered) {
              return (
                <div key={w.agent_id} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    data-agent-id={w.agent_id}
                    onClick={() => onSelectAgent(w)}
                    className={wVisuals.pulse || undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--nous-space-2xs)',
                      borderRadius: 'var(--nous-radius-xs)',
                      paddingInline: 'var(--nous-space-2xs)',
                      paddingBlock: '2px',
                      fontSize: 'var(--nous-font-size-xs)',
                      transition: 'background-color 0.15s',
                      ...(selectedAgentId === w.agent_id ? { boxShadow: '0 0 0 1px var(--nous-accent)' } : {}),
                      ...(wUrgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                    }}
                    aria-label={resolveAgentLabel(w)}
                    onMouseEnter={() => setHoveredId(w.agent_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    data-testid="hover-expand-tile"
                  >
                    <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...wVisuals.dotStyle }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '6rem', fontSize: '10px' }}>{resolveAgentLabel(w)}</span>
                    {wUrgent && <UrgentIcon />}
                  </button>
                </div>
              );
            }

            return (
              <div key={w.agent_id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-agent-id={w.agent_id}
                  onClick={() => onSelectAgent(w)}
                  className={wVisuals.pulse || undefined}
                  style={{
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: 'var(--nous-radius-xs)',
                    ...wVisuals.dotStyle,
                    ...(selectedAgentId === w.agent_id ? { boxShadow: '0 0 0 2px var(--nous-accent)' } : {}),
                    ...(wUrgent ? { boxShadow: '0 0 0 2px #ef4444' } : {}),
                  }}
                  aria-label={resolveAgentLabel(w)}
                  onMouseEnter={() => setHoveredId(w.agent_id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--nous-fg-muted)' }}>
          {workers.length + 1}
        </span>
      </div>
    );
  }

  if (densityMode === 'D3') {
    return (
      <div
        style={{
          borderRadius: 'var(--nous-radius-xs)',
          border: '1px solid',
          padding: '6px',
          ...classColor.fillStyle,
        }}
        data-testid="workflow-group-card"
      >
        {(() => {
          const orchVisuals = getStateVisuals(orchestrator.state);
          const orchUrgent = orchestrator.urgency_level === 'urgent';
          return (
            <button
              type="button"
              data-agent-id={orchestrator.agent_id}
              onClick={() => onSelectAgent(orchestrator)}
              className={orchVisuals.pulse || undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--nous-space-2xs)',
                borderRadius: 'var(--nous-radius-xs)',
                paddingInline: 'var(--nous-space-2xs)',
                paddingBlock: '2px',
                fontSize: 'var(--nous-font-size-xs)',
                fontWeight: 500,
                transition: 'background-color 0.15s',
                ...(selectedAgentId === orchestrator.agent_id ? { boxShadow: '0 0 0 1px var(--nous-accent)' } : {}),
                ...(orchUrgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
              }}
              aria-label={resolveAgentLabel(orchestrator)}
              onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...orchVisuals.dotStyle }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '6rem' }}>
                {hoveredId === orchestrator.agent_id
                  ? resolveAgentLabel(orchestrator)
                  : resolveAgentLabel(orchestrator).slice(0, 12)}
              </span>
              {orchUrgent && (
                <span data-testid="urgent-indicator"><UrgentIcon /></span>
              )}
            </button>
          );
        })()}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xs)', marginTop: 'var(--nous-space-2xs)' }}>
          {workers.map((w) => {
            const wVisuals = getStateVisuals(w.state);
            const wUrgent = w.urgency_level === 'urgent';
            return (
              <button
                key={w.agent_id}
                type="button"
                data-agent-id={w.agent_id}
                onClick={() => onSelectAgent(w)}
                className={wVisuals.pulse || undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--nous-space-2xs)',
                  borderRadius: 'var(--nous-radius-xs)',
                  paddingInline: 'var(--nous-space-2xs)',
                  paddingBlock: '2px',
                  fontSize: 'var(--nous-font-size-xs)',
                  transition: 'background-color 0.15s',
                  ...(selectedAgentId === w.agent_id ? { boxShadow: '0 0 0 1px var(--nous-accent)' } : {}),
                  ...(wUrgent ? { borderWidth: '2px', borderStyle: 'solid', borderColor: '#ef4444' } : {}),
                }}
                aria-label={resolveAgentLabel(w)}
                onMouseEnter={() => setHoveredId(w.agent_id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', ...wVisuals.dotStyle }} />
                {hoveredId === w.agent_id && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '6rem', fontSize: '10px' }}>{resolveAgentLabel(w)}</span>
                )}
                {wUrgent && (
                  <span data-testid="urgent-indicator"><UrgentIcon /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // D0, D1, D2 — full card rendering
  const isLarge = densityMode === 'D1' || densityMode === 'D0';
  const tileSize = tileSizeStyle(densityMode);

  return (
    <div
      style={{
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid',
        padding: isLarge ? 'var(--nous-space-2xl)' : 'var(--nous-space-xl)',
        ...classColor.fillStyle,
      }}
      data-testid="workflow-group-card"
    >
      {/* Orchestrator — header */}
      {(() => {
        const orchVisuals = getStateVisuals(orchestrator.state);
        const isSelected = selectedAgentId === orchestrator.agent_id;
        return (
          <button
            type="button"
            data-agent-id={orchestrator.agent_id}
            onClick={() => onSelectAgent(orchestrator)}
            className={orchVisuals.pulse || undefined}
            style={{
              width: '100%',
              borderRadius: 'var(--nous-radius-md)',
              border: '1px solid',
              padding: 'var(--nous-space-xl)',
              textAlign: 'left',
              transition: 'background-color 0.15s',
              ...(isSelected
                ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                : { borderColor: 'var(--nous-border-subtle)', backgroundColor: 'var(--nous-bg)' }),
              ...tileSize,
            }}
            aria-label={resolveAgentLabel(orchestrator)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>
                  {resolveAgentLabel(orchestrator)}
                </div>
                <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                  {orchestrator.state}
                </div>
              </div>
              <span style={{ display: 'inline-block', width: '0.625rem', height: '0.625rem', borderRadius: '9999px', marginTop: 'var(--nous-space-2xs)', ...orchVisuals.dotStyle }} />
            </div>
          </button>
        );
      })()}

      {/* Workers — horizontal flex-wrap */}
      {workers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)', marginTop: 'var(--nous-space-sm)' }} data-testid="workers-container">
          {workers.map((w) => {
            const wVisuals = getStateVisuals(w.state);
            const isSelected = selectedAgentId === w.agent_id;
            return (
              <button
                key={w.agent_id}
                type="button"
                data-agent-id={w.agent_id}
                onClick={() => onSelectAgent(w)}
                className={wVisuals.pulse || undefined}
                style={{
                  borderRadius: 'var(--nous-radius-md)',
                  border: '1px solid',
                  padding: 'var(--nous-space-sm)',
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                  ...(isSelected
                    ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                    : { borderColor: 'var(--nous-border-subtle)', backgroundColor: 'var(--nous-bg)' }),
                  ...tileSize,
                }}
                aria-label={resolveAgentLabel(w)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>
                      {resolveAgentLabel(w)}
                    </div>
                    <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      {w.state}
                    </div>
                  </div>
                  <span style={{ display: 'inline-block', width: '0.5rem', height: '0.5rem', borderRadius: '9999px', marginTop: 'var(--nous-space-2xs)', ...wVisuals.dotStyle }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
