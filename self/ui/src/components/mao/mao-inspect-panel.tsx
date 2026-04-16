'use client';

import * as React from 'react';
import type { MaoAgentInspectProjection, MaoSurfaceLink } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { buildMaoSurfaceHref, formatShortId } from './mao-links';
import { useMaoServices } from './mao-services-context';
import {
  resolveAgentLabel as resolveAgentLabelFromProjection,
  AGENT_CLASS_COLORS,
  FALLBACK_CLASS_COLOR,
} from './mao-workflow-group-card';

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
    const href = buildMaoSurfaceHref(link, {
      agentId: inspectData.agent.agent_id,
      evidenceRef: inspectData.agent.reasoning_log_preview?.evidenceRef ?? undefined,
      reasoningRef: inspectData.agent.reasoning_log_preview?.evidenceRef ?? undefined,
    });

    const linkBase: React.CSSProperties = {
      borderRadius: 'var(--nous-radius-sm)',
      border: '1px solid var(--nous-border-subtle)',
      paddingInline: 'var(--nous-space-sm)',
      paddingBlock: 'var(--nous-space-2xs)',
      fontSize: 'var(--nous-font-size-xs)',
    };

    if (!href) {
      return (
        <span
          key={`${link.target}-${index}`}
          style={{ ...linkBase, color: 'var(--nous-fg-muted)' }}
        >
          {link.target}
        </span>
      );
    }

    return (
      <Link
        key={`${link.target}-${index}`}
        href={href}
        style={linkBase}
      >
        {link.target}
      </Link>
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

            {inspect.agent.reasoning_log_preview ? (
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
            ) : null}

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
