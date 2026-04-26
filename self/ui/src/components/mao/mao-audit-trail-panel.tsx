'use client';

import * as React from 'react';
import type { ControlActorType, ProjectId } from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { trpc, useEventSubscription } from '@nous/transport';
import { SEVERITY_TOKEN_TO_CSS_VAR } from './mao-inspect-panel';

// --- WR-162 SP 14 SUPV-SP14-015 — Closed Record over five-literal ControlActorType admit ---
//
// The closed `Record<ControlActorType, ActorVisualTreatment>` provides
// per-actor visual treatment for audit-trail entries. The supervisor row
// renders the visual distinction (glyph + caution-tone badge); other rows
// render neutral baseline. TypeScript exhaustiveness over the five-literal
// admit (`'principal' | 'orchestration_agent' | 'worker_agent' |
// 'system_agent' | 'supervisor'`) catches drift at compile time.
//
// Renderer-side gap: `MaoControlAuditHistoryEntrySchema` does NOT currently
// carry an `actor_type` field (only `actorId`). The renderer reads the field
// defensively when present; otherwise falls back to the `'principal'` baseline.
// The data-plane gap is tracked at SUPV-SP14-AI-AUDIT-ACTOR-TYPE-DATA-PLANE-GAP
// for phase-close follow-up. The closed `Record` shape preserves the SDS
// admission discipline (UT-SP14-CAT-ACTOR-TYPE) and enables transparent wiring
// once the upstream contract surfaces actor_type.
export type ActorVisualTreatment = {
  glyph: 'supervisor' | null;
  badge: string;
  /** Mapped to `SEVERITY_TOKEN_TO_CSS_VAR` for color semantics. */
  toneSeverity: 'low' | 'medium' | 'high' | 'critical';
};

export const ACTOR_VISUAL: Record<ControlActorType, ActorVisualTreatment> = {
  principal: { glyph: null, badge: 'Principal', toneSeverity: 'low' },
  orchestration_agent: {
    glyph: null,
    badge: 'Orchestrator',
    toneSeverity: 'low',
  },
  worker_agent: { glyph: null, badge: 'Worker', toneSeverity: 'low' },
  system_agent: { glyph: null, badge: 'System', toneSeverity: 'medium' },
  supervisor: { glyph: 'supervisor', badge: 'Supervisor', toneSeverity: 'high' },
};

/**
 * SUPV-SP14-015 — Defensive actor-type read. The audit-history entry
 * schema currently does not surface `actor_type`; this resolver reads the
 * field if the runtime payload carries it (e.g., once the data plane lands
 * the contract widening) and otherwise defaults to `'principal'` baseline.
 */
function readActorType(entry: unknown): ControlActorType {
  if (entry !== null && typeof entry === 'object' && 'actor_type' in entry) {
    const candidate = (entry as { actor_type?: unknown }).actor_type;
    if (
      candidate === 'principal' ||
      candidate === 'orchestration_agent' ||
      candidate === 'worker_agent' ||
      candidate === 'system_agent' ||
      candidate === 'supervisor'
    ) {
      return candidate;
    }
  }
  return 'principal';
}

/**
 * SUPV-SP14-015 — Supervisor glyph component. Inline SVG to avoid adding a new
 * dependency or a new asset import. Render contract: presence of the glyph
 * IS the visual distinction.
 */
function SupervisorGlyph() {
  return (
    <span
      data-testid="audit-actor-supervisor-glyph"
      aria-label="Supervisor actor"
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '0.875rem',
        height: '0.875rem',
        marginRight: 'var(--nous-space-2xs)',
        color: SEVERITY_TOKEN_TO_CSS_VAR.high,
      }}
    >
      {/* triangle alert glyph — preserves the existing supervisor visual
          vocabulary across MAO surfaces */}
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M8 1L15 14H1L8 1Z M8 6V10 M8 11.5V12.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      </svg>
    </span>
  );
}

export interface MaoAuditTrailPanelProps {
  projectId: ProjectId | null;
}

export function MaoAuditTrailPanel({ projectId }: MaoAuditTrailPanelProps) {
  const utils = trpc.useUtils();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const isSentinel = projectId === SYSTEM_SCOPE_SENTINEL_PROJECT_ID;

  const auditQuery = trpc.mao.getControlAuditHistory.useQuery(
    { projectId: projectId as string },
    { enabled: !!projectId && !isSentinel },
  );

  useEventSubscription({
    channels: ['mao:control-action'],
    onEvent: () => {
      void utils.mao.getControlAuditHistory.invalidate();
    },
    enabled: !!projectId && !isSentinel,
  });

  const entries = auditQuery.data ?? [];

  const mutedText: React.CSSProperties = { color: 'var(--nous-fg-muted)' };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Audit trail</span>
          {entries.length > 0 ? (
            <Badge variant="outline">{entries.length} entries</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)', paddingTop: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
        {isSentinel ? (
          <p style={mutedText} data-testid="sentinel-indicator">
            System-level agent — audit trail scoped to project context.
          </p>
        ) : auditQuery.isLoading ? (
          <p style={mutedText}>Loading audit history...</p>
        ) : auditQuery.isError ? (
          <p style={mutedText}>
            Failed to load audit history.
          </p>
        ) : entries.length === 0 ? (
          <p style={mutedText}>
            No control actions have been recorded for this project.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.commandId;
              const actorType = readActorType(entry);
              const treatment = ACTOR_VISUAL[actorType];

              return (
                <button
                  key={entry.commandId}
                  type="button"
                  data-actor-type={actorType}
                  data-actor-badge={treatment.badge}
                  style={{
                    width: '100%',
                    borderRadius: 'var(--nous-radius-sm)',
                    border: '1px solid var(--nous-border-subtle)',
                    paddingInline: 'var(--nous-space-md)',
                    paddingBlock: 'var(--nous-space-sm)',
                    textAlign: 'left',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.commandId)
                  }
                  aria-expanded={isExpanded}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
                      <Badge variant="outline">
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                      <span
                        data-testid={`audit-actor-${actorType}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--nous-space-2xs)',
                          fontSize: 'var(--nous-font-size-xs)',
                          color: SEVERITY_TOKEN_TO_CSS_VAR[treatment.toneSeverity],
                          fontWeight: 500,
                        }}
                      >
                        {treatment.glyph === 'supervisor' ? (
                          <SupervisorGlyph />
                        ) : null}
                        {treatment.badge}
                      </span>
                      <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                        {entry.actorId}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    {entry.reason}
                  </div>

                  {isExpanded ? (
                    <div style={{ marginTop: 'var(--nous-space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-2xs)', borderTop: '1px solid var(--nous-border-subtle)', paddingTop: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>Command ID:</span>{' '}
                        {entry.commandId}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Reason code:</span>{' '}
                        {entry.reasonCode}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Resume readiness:</span>{' '}
                        {entry.resumeReadinessStatus}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Decision ref:</span>{' '}
                        {entry.decisionRef}
                      </div>
                      {entry.evidenceRefs.length > 0 ? (
                        <div>
                          <span style={{ fontWeight: 500 }}>Evidence refs:</span>{' '}
                          <span
                            data-testid="audit-evidence-ref-list"
                            style={{
                              display: 'inline-flex',
                              flexWrap: 'wrap',
                              gap: 'var(--nous-space-2xs)',
                            }}
                          >
                            {entry.evidenceRefs.map((ref) => (
                              // SUPV-SP14-014 — three-attribute evidence-ref pattern
                              // (reuses SP 13 SUPV-SP13-013 vocabulary). When a
                              // routable href surfaces (future data-plane work),
                              // this can switch to a `<Link>` element; today the
                              // muted-span fall-through is the deliberate render
                              // shape per SP 13 precedent.
                              <span
                                key={ref}
                                data-mao-evidence-ref={ref}
                                data-mao-evidence-source="audit-trail"
                                data-mao-evidence-command-id={entry.commandId}
                                style={{
                                  borderRadius: 'var(--nous-radius-sm)',
                                  border: '1px solid var(--nous-border-subtle)',
                                  paddingInline: 'var(--nous-space-2xs)',
                                  paddingBlock: '0',
                                  fontFamily: 'var(--nous-font-family-mono)',
                                  color: 'var(--nous-fg-muted)',
                                }}
                              >
                                {ref}
                              </span>
                            ))}
                          </span>
                        </div>
                      ) : null}
                    </div>
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
