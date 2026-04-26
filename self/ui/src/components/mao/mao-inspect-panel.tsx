'use client';

import * as React from 'react';
import type {
  GuardrailStatus,
  MaoAgentInspectProjection,
  MaoSurfaceLink,
  WitnessIntegrityStatus,
} from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { buildMaoSurfaceHref, formatShortId } from './mao-links';
import { useMaoServices } from './mao-services-context';
import {
  resolveAgentLabel as resolveAgentLabelFromProjection,
  AGENT_CLASS_COLORS,
  FALLBACK_CLASS_COLOR,
} from './mao-workflow-group-card';

/**
 * SUPV-SP13-016 — Severity-token mapping form (closed `Record<>`).
 * SUPV-SP13-019 — Sentinel risk-score band-table (closed array).
 * SUPV-SP13-022 — Reasoning-log redaction-state visual-treatment mapping.
 *
 * Per `feedback_no_heuristic_bandaids.md`:
 * - severity-token mapping is closed-form; compile-time exhaustiveness via
 *   `Record<TLiteral, TToken>`.
 * - sentinel risk-score band mapping is closed-form via single ordered
 *   `for...of` over a closed `BAND_TABLE` constant.
 * - supervisor-field absence is the UX signal — not a heuristic placeholder.
 *
 * Each constant is exported so that `mao-inspect-popup.tsx` can consume
 * the same source-of-truth mappings (SDS § Failure Modes default disposition:
 * re-export from `mao-inspect-panel.tsx`; new module-private file is the
 * fallback; default disposition retained per IP Phase 0 Task 0b).
 */
export type SeverityToken = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_TOKEN_TO_CSS_VAR: Record<SeverityToken, string> = {
  low: 'var(--nous-alert-success)',
  medium: 'var(--nous-alert-warning)',
  high: 'var(--nous-alert-error)',
  critical: 'var(--nous-alert-critical)',
};

export const GUARDRAIL_SEVERITY: Record<GuardrailStatus, SeverityToken> = {
  clear: 'low',
  warning: 'medium',
  violation: 'high',
  enforced: 'critical',
};

export const WITNESS_INTEGRITY_SEVERITY: Record<WitnessIntegrityStatus, SeverityToken> = {
  intact: 'low',
  degraded: 'medium',
  broken: 'high',
};

export const SENTINEL_RISK_BANDS: ReadonlyArray<{ readonly upper: number; readonly token: SeverityToken }> = [
  { upper: 0.25, token: 'low' },
  { upper: 0.5, token: 'medium' },
  { upper: 0.75, token: 'high' },
  { upper: 1.0, token: 'critical' },
];

export function resolveSentinelBand(score: number): SeverityToken {
  for (const band of SENTINEL_RISK_BANDS) {
    if (score < band.upper) return band.token;
  }
  return 'critical'; // catches score === 1.0
}

type ReasoningLogRedactionState = 'none' | 'partial' | 'restricted';
type VisualTreatment = {
  readonly badgeText: string;
  readonly badgeStyle: 'low' | 'medium' | 'high';
};

export const REDACTION_VISUAL: Record<ReasoningLogRedactionState, VisualTreatment> = {
  none: { badgeText: 'Full reasoning', badgeStyle: 'low' },
  partial: { badgeText: 'Partially redacted', badgeStyle: 'medium' },
  restricted: { badgeText: 'Reasoning restricted', badgeStyle: 'high' },
};

const REDACTION_STYLE_TO_CSS_VAR: Record<VisualTreatment['badgeStyle'], string> = {
  low: SEVERITY_TOKEN_TO_CSS_VAR.low,
  medium: SEVERITY_TOKEN_TO_CSS_VAR.medium,
  high: SEVERITY_TOKEN_TO_CSS_VAR.high,
};

interface MaoInspectPanelProps {
  inspect: MaoAgentInspectProjection | null | undefined;
  isLoading: boolean;
  /** Resolve a dispatching agent UUID to a human-readable label */
  resolveAgentLabel?: (agentId: string) => string;
}

export function MaoInspectPanel({ inspect, isLoading, resolveAgentLabel }: MaoInspectPanelProps) {
  const { Link } = useMaoServices();
  const [inferenceHistoryOpen, setInferenceHistoryOpen] = React.useState(false);

  function renderSurfaceLink(
    link: MaoSurfaceLink,
    inspectData: MaoAgentInspectProjection,
    index: number,
  ) {
    const evidenceRef =
      inspectData.agent.reasoning_log_preview?.evidenceRef ?? undefined;
    const href = buildMaoSurfaceHref(link, {
      agentId: inspectData.agent.agent_id,
      evidenceRef,
      reasoningRef: evidenceRef,
    });

    const linkBase: React.CSSProperties = {
      borderRadius: 'var(--nous-radius-sm)',
      border: '1px solid var(--nous-border-subtle)',
      paddingInline: 'var(--nous-space-sm)',
      paddingBlock: 'var(--nous-space-2xs)',
      fontSize: 'var(--nous-font-size-xs)',
    };

    if (!href) {
      // SUPV-SP13-013 — muted span fall-through preserved verbatim when
      // `buildMaoSurfaceHref` resolves to `null` (e.g., target lacks a
      // routable surface).
      return (
        <span
          key={`${link.target}-${index}`}
          data-mao-evidence-ref={link.target}
          data-mao-evidence-source={evidenceRef ?? ''}
          style={{ ...linkBase, color: 'var(--nous-fg-muted)' }}
        >
          {link.target}
        </span>
      );
    }

    // SUPV-SP13-013 — three-attribute render contract: source identifier
    // (`data-mao-evidence-ref`), evidence source (`data-mao-evidence-source`),
    // and resolved `href` for the deep-link affordance. Per
    // `feedback_no_heuristic_bandaids.md` "evidence rendering is field-level,
    // with closed-form deep-link affordances."
    return (
      <Link
        key={`${link.target}-${index}`}
        href={href}
        data-mao-evidence-ref={link.target}
        data-mao-evidence-source={evidenceRef ?? ''}
        style={linkBase}
      >
        {link.target}
      </Link>
    );
  }

  /**
   * SUPV-SP13-017 + SUPV-SP13-018 — Conditional supervisor-section
   * rendering. When all three supervisor fields are absent, return `null` —
   * NO DOM node is emitted. Per HF-019 dispatch-packet binding: "render
   * `null` when no data is present — do not stub with placeholder data."
   */
  function renderSupervisorSection(
    projection: MaoAgentInspectProjection['agent'],
  ): React.ReactNode | null {
    const guardrail = (projection as { guardrail_status?: GuardrailStatus }).guardrail_status;
    const witness = (projection as { witness_integrity_status?: WitnessIntegrityStatus })
      .witness_integrity_status;
    const sentinel = (projection as { sentinel_risk_score?: number }).sentinel_risk_score;

    const hasSupervisor =
      guardrail !== undefined ||
      witness !== undefined ||
      sentinel !== undefined;

    if (!hasSupervisor) {
      return null;
    }

    return (
      <section
        data-testid="mao-supervisor-section"
        data-mao-supervisor-section="present"
        style={sectionStyle}
      >
        <div style={{ fontWeight: 500 }}>Supervisor</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
          {guardrail !== undefined ? (
            <Badge
              variant="outline"
              data-mao-guardrail={guardrail}
              data-mao-severity={GUARDRAIL_SEVERITY[guardrail]}
              style={{
                borderColor: SEVERITY_TOKEN_TO_CSS_VAR[GUARDRAIL_SEVERITY[guardrail]],
                color: SEVERITY_TOKEN_TO_CSS_VAR[GUARDRAIL_SEVERITY[guardrail]],
              }}
            >
              Guardrail: {guardrail}
            </Badge>
          ) : null}
          {witness !== undefined ? (
            <Badge
              variant="outline"
              data-mao-witness-integrity={witness}
              data-mao-severity={WITNESS_INTEGRITY_SEVERITY[witness]}
              style={{
                borderColor: SEVERITY_TOKEN_TO_CSS_VAR[WITNESS_INTEGRITY_SEVERITY[witness]],
                color: SEVERITY_TOKEN_TO_CSS_VAR[WITNESS_INTEGRITY_SEVERITY[witness]],
              }}
            >
              Witness integrity: {witness}
            </Badge>
          ) : null}
          {sentinel !== undefined ? (
            <Badge
              variant="outline"
              data-mao-sentinel-risk={sentinel.toFixed(2)}
              data-mao-severity={resolveSentinelBand(sentinel)}
              style={{
                borderColor: SEVERITY_TOKEN_TO_CSS_VAR[resolveSentinelBand(sentinel)],
                color: SEVERITY_TOKEN_TO_CSS_VAR[resolveSentinelBand(sentinel)],
              }}
            >
              Sentinel risk: {sentinel.toFixed(2)}
            </Badge>
          ) : null}
        </div>
      </section>
    );
  }

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

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--nous-space-sm)',
  };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ fontSize: 'var(--nous-font-size-base)' }}>Inspect panel</CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-lg)', paddingTop: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
        {isLoading ? (
          <p style={{ color: 'var(--nous-fg-muted)' }}>Loading inspect projection...</p>
        ) : !inspect ? (
          <p style={{ color: 'var(--nous-fg-muted)' }}>
            Select an MAO tile or graph node to inspect runtime state, reasoning
            previews, and evidence continuity.
          </p>
        ) : (
          <>
            <div style={sectionStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
                <span style={{ fontSize: 'var(--nous-font-size-base)', fontWeight: 600 }} data-testid="inspect-primary-label">
                  {resolveAgentLabelFromProjection(inspect.agent as any)}
                </span>
                {(() => {
                  const classKey = (inspect.agent as any).agent_class ?? '';
                  const classColor = AGENT_CLASS_COLORS[classKey] ?? FALLBACK_CLASS_COLOR;
                  return classKey ? (
                    <Badge
                      variant="outline"
                      style={classColor.fillStyle}
                      data-testid="inspect-agent-class-badge"
                    >
                      {classColor.label}
                    </Badge>
                  ) : null;
                })()}
                <Badge variant="outline">{inspect.agent.state}</Badge>
                <Badge variant="outline">{inspect.agent.urgency_level}</Badge>
                <Badge variant="outline">{inspect.projectControlState}</Badge>
              </div>
              {inspect.agent.dispatching_task_agent_id ? (
                <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }} data-testid="inspect-dispatch-lineage">
                  Dispatched by:{' '}
                  <span style={{ fontWeight: 500 }}>
                    {resolveAgentLabel
                      ? resolveAgentLabel(inspect.agent.dispatching_task_agent_id)
                      : formatShortId(inspect.agent.dispatching_task_agent_id)}
                  </span>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
                <div style={cellBase}>
                  <div style={labelStyle}>Agent</div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{formatShortId(inspect.agent.agent_id)}</div>
                </div>
                <div style={cellBase}>
                  <div style={labelStyle}>Run</div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)' }}>
                    {formatShortId(inspect.workflowRunId ?? inspect.agent.workflow_run_id)}
                  </div>
                </div>
                <div style={cellBase}>
                  <div style={labelStyle}>Wait posture</div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{inspect.waitKind ?? 'n/a'}</div>
                </div>
                <div style={cellBase}>
                  <div style={labelStyle}>Run status</div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{inspect.runStatus ?? 'n/a'}</div>
                </div>
              </div>
            </div>

            {(() => {
              /*
               * SUPV-SP13-021 + SUPV-SP13-022 — Reasoning-log redaction-state
               * visual distinguishability via closed `Record<>` mapping. Three
               * states map to three distinct badge texts + style severities.
               * DNR-B4 binding.
               */
              const redactionState = (
                inspect.agent as { reasoning_log_redaction_state?: ReasoningLogRedactionState }
              ).reasoning_log_redaction_state ?? 'none';
              const visual = REDACTION_VISUAL[redactionState];
              const redactionColor = REDACTION_STYLE_TO_CSS_VAR[visual.badgeStyle];
              return inspect.agent.reasoning_log_preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)', borderRadius: 'var(--nous-radius-sm)', border: '1px solid var(--nous-border-subtle)', padding: 'var(--nous-space-xl)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
                  <Badge variant="outline">
                    {inspect.agent.reasoning_log_preview.class}
                  </Badge>
                  <Badge variant="outline">
                    {inspect.agent.reasoning_log_preview.redactionClass}
                  </Badge>
                  <Badge variant="outline">
                    {inspect.agent.reasoning_log_preview.previewMode}
                  </Badge>
                  <Badge
                    variant="outline"
                    data-testid="redaction-visual-badge"
                    data-mao-redaction-state={redactionState}
                    data-mao-redaction-style={visual.badgeStyle}
                    style={{ borderColor: redactionColor, color: redactionColor }}
                  >
                    {visual.badgeText}
                  </Badge>
                </div>
                <p>{inspect.agent.reasoning_log_preview.summary}</p>
                <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                  evidence {inspect.agent.reasoning_log_preview.evidenceRef}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
                  {inspect.agent.reasoning_log_preview.chatLink
                    ? renderSurfaceLink(
                        inspect.agent.reasoning_log_preview.chatLink,
                        inspect,
                        0,
                      )
                    : null}
                  {inspect.agent.reasoning_log_preview.projectsLink
                    ? renderSurfaceLink(
                        inspect.agent.reasoning_log_preview.projectsLink,
                        inspect,
                        1,
                      )
                    : null}
                </div>
              </div>
            ) : null;
            })()}

            {/*
              * SUPV-SP13-017 + SUPV-SP13-018 — Conditional supervisor section.
              * Renders only when at least one of guardrail_status,
              * witness_integrity_status, or sentinel_risk_score is present;
              * otherwise emits ZERO DOM nodes (no placeholder).
              */}
            {renderSupervisorSection(inspect.agent)}

            <div style={sectionStyle}>
              <div style={{ fontWeight: 500 }}>Latest attempt</div>
              {inspect.latestAttempt ? (
                <div style={cellBase}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <span>Attempt {inspect.latestAttempt.attempt}</span>
                    <Badge variant="outline">{inspect.latestAttempt.status}</Badge>
                  </div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    {inspect.latestAttempt.reasonCode}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--nous-fg-muted)' }}>No attempt history is available.</p>
              )}
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 500 }}>Correction arcs</div>
              {!inspect.correctionArcs.length ? (
                <p style={{ color: 'var(--nous-fg-muted)' }}>
                  No corrective arcs have been recorded for this agent.
                </p>
              ) : (
                inspect.correctionArcs.map((arc) => (
                  <div key={arc.id} style={cellBase}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                      <span>
                        attempt {arc.sourceAttempt}
                        {arc.targetAttempt ? ` -> ${arc.targetAttempt}` : ''}
                      </span>
                      <Badge variant="outline">{arc.type}</Badge>
                    </div>
                    <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      {arc.reasonCode} • {arc.evidenceRefs[0] ?? 'n/a'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 500 }}>Deep links</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
                {inspect.agent.deepLinks.map((link, index) =>
                  renderSurfaceLink(link, inspect, index),
                )}
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 500 }}>Evidence refs</div>
              {!inspect.evidenceRefs.length ? (
                <p style={{ color: 'var(--nous-fg-muted)' }}>
                  No evidence refs are attached to this inspect projection.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
                  {inspect.evidenceRefs.map((ref) => (
                    <Badge key={ref} variant="outline">
                      {ref}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div style={sectionStyle}>
              <button
                type="button"
                onClick={() => setInferenceHistoryOpen((prev) => !prev)}
                style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', fontWeight: 500 }}
                data-testid="inference-history-toggle"
              >
                <span>Inference History</span>
                <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                  {inferenceHistoryOpen ? '\u25B2' : '\u25BC'}
                </span>
              </button>
              {inferenceHistoryOpen ? (
                !inspect.inference_history?.length ? (
                  <p style={{ color: 'var(--nous-fg-muted)' }}>
                    No inference history available.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 'var(--nous-font-size-xs)' }} data-testid="inference-history-table">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--nous-border-subtle)', textAlign: 'left', color: 'var(--nous-fg-muted)' }}>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', fontWeight: 500 }}>Timestamp</th>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', fontWeight: 500 }}>Provider</th>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', fontWeight: 500 }}>Model</th>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', fontWeight: 500, textAlign: 'right' }}>In tokens</th>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', fontWeight: 500, textAlign: 'right' }}>Out tokens</th>
                          <th style={{ paddingBottom: 'var(--nous-space-2xs)', fontWeight: 500, textAlign: 'right' }}>Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...inspect.inference_history]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .slice(0, 50)
                          .map((entry, idx) => (
                            <tr key={`${entry.traceId}-${idx}`} style={{ borderBottom: '1px solid rgba(18,18,18,0.5)' }}>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', whiteSpace: 'nowrap' }}>
                                {new Date(entry.timestamp).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </td>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)' }}>{entry.providerId}</td>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)' }}>{entry.modelId}</td>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {entry.inputTokens != null ? entry.inputTokens.toLocaleString() : '\u2014'}
                              </td>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', paddingRight: 'var(--nous-space-xl)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {entry.outputTokens != null ? entry.outputTokens.toLocaleString() : '\u2014'}
                              </td>
                              <td style={{ paddingBlock: 'var(--nous-space-2xs)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {Math.round(entry.latencyMs)}ms
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
