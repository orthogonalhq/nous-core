'use client';

import * as React from 'react';
import type { MaoAgentProjection, MaoDensityMode } from '@nous/shared';
import { getStateVisuals } from './mao-state-utils';

/** Agent class color mapping for edge connectors and tile accents */
export interface AgentClassColor {
  stroke: string;
  fill: string;
  label: string;
}

export const AGENT_CLASS_COLORS: Record<string, AgentClassColor> = {
  'Cortex::Principal': {
    stroke: 'stroke-blue-500',
    fill: 'bg-blue-500/10 border-blue-500/40',
    label: 'Principal',
  },
  'Cortex::System': {
    stroke: 'stroke-violet-500',
    fill: 'bg-violet-500/10 border-violet-500/40',
    label: 'System',
  },
  Orchestrator: {
    stroke: 'stroke-amber-500',
    fill: 'bg-amber-500/10 border-amber-500/40',
    label: 'Orchestrator',
  },
  Worker: {
    stroke: 'stroke-emerald-500',
    fill: 'bg-emerald-500/10 border-emerald-500/40',
    label: 'Worker',
  },
};

export const FALLBACK_CLASS_COLOR: AgentClassColor = {
  stroke: 'stroke-slate-400',
  fill: 'bg-slate-500/10 border-slate-500/40',
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

function tileSizeClasses(densityMode: MaoDensityMode): string {
  switch (densityMode) {
    case 'D0':
    case 'D1':
      return 'min-w-64 p-4';
    case 'D2':
      return 'min-w-48 p-3';
    case 'D3':
      return 'min-w-16 p-1.5';
    case 'D4':
      return 'w-6 h-6';
    default:
      return 'min-w-48 p-3';
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
      className="text-red-500 shrink-0"
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
        className={`relative rounded border ${classColor.fill} p-1`}
        data-testid="workflow-group-card"
      >
        {/* Orchestrator tile — D4 with hover-expand to D3 */}
        {(() => {
          const isHovered = hoveredId === orchestrator.agent_id;
          const orchVisuals = getStateVisuals(orchestrator.state);
          const orchUrgent = orchestrator.urgency_level === 'urgent';

          if (isHovered) {
            // Hover-expand: render D3 compact markup
            return (
              <button
                type="button"
                data-agent-id={orchestrator.agent_id}
                onClick={() => onSelectAgent(orchestrator)}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium transition-colors hover:bg-muted/30 ${
                  selectedAgentId === orchestrator.agent_id ? 'ring-1 ring-primary' : ''
                } ${orchUrgent ? 'border-2 border-red-500' : ''} ${orchVisuals.pulse}`}
                aria-label={resolveAgentLabel(orchestrator)}
                onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
                onMouseLeave={() => setHoveredId(null)}
                data-testid="hover-expand-tile"
              >
                <span className={`inline-block w-2 h-2 rounded-full ${orchVisuals.dot}`} />
                <span className="truncate max-w-24">
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
              className={`w-6 h-6 rounded ${orchVisuals.dot} ${
                selectedAgentId === orchestrator.agent_id ? 'ring-2 ring-primary' : ''
              } ${orchUrgent ? 'ring-2 ring-red-500' : ''} ${orchVisuals.pulse}`}
              aria-label={resolveAgentLabel(orchestrator)}
              onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          );
        })()}

        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {workers.map((w) => {
            const isHovered = hoveredId === w.agent_id;
            const wVisuals = getStateVisuals(w.state);
            const wUrgent = w.urgency_level === 'urgent';

            if (isHovered) {
              // Hover-expand: render D3 compact markup
              return (
                <div key={w.agent_id} className="relative">
                  <button
                    type="button"
                    data-agent-id={w.agent_id}
                    onClick={() => onSelectAgent(w)}
                    className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted/30 ${
                      selectedAgentId === w.agent_id ? 'ring-1 ring-primary' : ''
                    } ${wUrgent ? 'border-2 border-red-500' : ''} ${wVisuals.pulse}`}
                    aria-label={resolveAgentLabel(w)}
                    onMouseEnter={() => setHoveredId(w.agent_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    data-testid="hover-expand-tile"
                  >
                    <span className={`inline-block w-2 h-2 rounded-full ${wVisuals.dot}`} />
                    <span className="truncate max-w-24 text-[10px]">{resolveAgentLabel(w)}</span>
                    {wUrgent && <UrgentIcon />}
                  </button>
                </div>
              );
            }

            return (
              <div key={w.agent_id} className="relative">
                <button
                  type="button"
                  data-agent-id={w.agent_id}
                  onClick={() => onSelectAgent(w)}
                  className={`w-6 h-6 rounded ${wVisuals.dot} ${
                    selectedAgentId === w.agent_id ? 'ring-2 ring-primary' : ''
                  } ${wUrgent ? 'ring-2 ring-red-500' : ''} ${wVisuals.pulse}`}
                  aria-label={resolveAgentLabel(w)}
                  onMouseEnter={() => setHoveredId(w.agent_id)}
                  onMouseLeave={() => setHoveredId(null)}
                />
              </div>
            );
          })}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {workers.length + 1}
        </span>
      </div>
    );
  }

  if (densityMode === 'D3') {
    return (
      <div
        className={`rounded border ${classColor.fill} p-1.5`}
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
              className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium transition-colors hover:bg-muted/30 ${
                selectedAgentId === orchestrator.agent_id ? 'ring-1 ring-primary' : ''
              } ${orchUrgent ? 'border-2 border-red-500' : ''} ${orchVisuals.pulse}`}
              aria-label={resolveAgentLabel(orchestrator)}
              onMouseEnter={() => setHoveredId(orchestrator.agent_id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${orchVisuals.dot}`} />
              <span className="truncate max-w-24">
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
        <div className="flex flex-wrap gap-1 mt-1">
          {workers.map((w) => {
            const wVisuals = getStateVisuals(w.state);
            const wUrgent = w.urgency_level === 'urgent';
            return (
              <button
                key={w.agent_id}
                type="button"
                data-agent-id={w.agent_id}
                onClick={() => onSelectAgent(w)}
                className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted/30 ${
                  selectedAgentId === w.agent_id ? 'ring-1 ring-primary' : ''
                } ${wUrgent ? 'border-2 border-red-500' : ''} ${wVisuals.pulse}`}
                aria-label={resolveAgentLabel(w)}
                onMouseEnter={() => setHoveredId(w.agent_id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${wVisuals.dot}`} />
                {hoveredId === w.agent_id && (
                  <span className="truncate max-w-24 text-[10px]">{resolveAgentLabel(w)}</span>
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
  const tileSize = tileSizeClasses(densityMode);

  return (
    <div
      className={`rounded-lg border ${classColor.fill} ${isLarge ? 'p-4' : 'p-3'}`}
      data-testid="workflow-group-card"
    >
      {/* Orchestrator — header */}
      {(() => {
        const orchVisuals = getStateVisuals(orchestrator.state);
        return (
          <button
            type="button"
            data-agent-id={orchestrator.agent_id}
            onClick={() => onSelectAgent(orchestrator)}
            className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/20 ${
              selectedAgentId === orchestrator.agent_id
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background'
            } ${tileSize} ${orchVisuals.pulse}`}
            aria-label={resolveAgentLabel(orchestrator)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {resolveAgentLabel(orchestrator)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {orchestrator.state}
                </div>
              </div>
              <span className={`inline-block w-2.5 h-2.5 rounded-full mt-1 ${orchVisuals.dot}`} />
            </div>
          </button>
        );
      })()}

      {/* Workers — horizontal flex-wrap */}
      {workers.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2" data-testid="workers-container">
          {workers.map((w) => {
            const wVisuals = getStateVisuals(w.state);
            return (
              <button
                key={w.agent_id}
                type="button"
                data-agent-id={w.agent_id}
                onClick={() => onSelectAgent(w)}
                className={`rounded-lg border p-2 text-left transition-colors hover:bg-muted/20 ${
                  selectedAgentId === w.agent_id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background'
                } ${tileSize} ${wVisuals.pulse}`}
                aria-label={resolveAgentLabel(w)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {resolveAgentLabel(w)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {w.state}
                    </div>
                  </div>
                  <span className={`inline-block w-2 h-2 rounded-full mt-1 ${wVisuals.dot}`} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
