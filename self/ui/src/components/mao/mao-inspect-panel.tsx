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

    if (!href) {
      return (
        <span
          key={`${link.target}-${index}`}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
        >
          {link.target}
        </span>
      );
    }

    return (
      <Link
        key={`${link.target}-${index}`}
        href={href}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/20"
      >
        {link.target}
      </Link>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Inspect panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Loading inspect projection...</p>
        ) : !inspect ? (
          <p className="text-muted-foreground">
            Select an MAO tile or graph node to inspect runtime state, reasoning
            previews, and evidence continuity.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold" data-testid="inspect-primary-label">
                  {resolveAgentLabelFromProjection(inspect.agent as any)}
                </span>
                {(() => {
                  const classKey = (inspect.agent as any).agent_class ?? '';
                  const classColor = AGENT_CLASS_COLORS[classKey] ?? FALLBACK_CLASS_COLOR;
                  return classKey ? (
                    <Badge
                      variant="outline"
                      className={classColor.fill}
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
                <div className="text-xs text-muted-foreground" data-testid="inspect-dispatch-lineage">
                  Dispatched by:{' '}
                  <span className="font-medium">
                    {resolveAgentLabel
                      ? resolveAgentLabel(inspect.agent.dispatching_task_agent_id)
                      : formatShortId(inspect.agent.dispatching_task_agent_id)}
                  </span>
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Agent
                  </div>
                  <div className="mt-1">{formatShortId(inspect.agent.agent_id)}</div>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Run
                  </div>
                  <div className="mt-1">
                    {formatShortId(inspect.workflowRunId ?? inspect.agent.workflow_run_id)}
                  </div>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Wait posture
                  </div>
                  <div className="mt-1">{inspect.waitKind ?? 'n/a'}</div>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Run status
                  </div>
                  <div className="mt-1">{inspect.runStatus ?? 'n/a'}</div>
                </div>
              </div>
            </div>

            {inspect.agent.reasoning_log_preview ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap gap-2">
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
                <div className="text-xs text-muted-foreground">
                  evidence {inspect.agent.reasoning_log_preview.evidenceRef}
                </div>
                <div className="flex flex-wrap gap-2">
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

            <div className="space-y-2">
              <div className="font-medium">Latest attempt</div>
              {inspect.latestAttempt ? (
                <div className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>Attempt {inspect.latestAttempt.attempt}</span>
                    <Badge variant="outline">{inspect.latestAttempt.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {inspect.latestAttempt.reasonCode}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No attempt history is available.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="font-medium">Correction arcs</div>
              {!inspect.correctionArcs.length ? (
                <p className="text-muted-foreground">
                  No corrective arcs have been recorded for this agent.
                </p>
              ) : (
                inspect.correctionArcs.map((arc) => (
                  <div
                    key={arc.id}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        attempt {arc.sourceAttempt}
                        {arc.targetAttempt ? ` -> ${arc.targetAttempt}` : ''}
                      </span>
                      <Badge variant="outline">{arc.type}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {arc.reasonCode} • {arc.evidenceRefs[0] ?? 'n/a'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <div className="font-medium">Deep links</div>
              <div className="flex flex-wrap gap-2">
                {inspect.agent.deepLinks.map((link, index) =>
                  renderSurfaceLink(link, inspect, index),
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">Evidence refs</div>
              {!inspect.evidenceRefs.length ? (
                <p className="text-muted-foreground">
                  No evidence refs are attached to this inspect projection.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {inspect.evidenceRefs.map((ref) => (
                    <Badge key={ref} variant="outline">
                      {ref}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setInferenceHistoryOpen((prev) => !prev)}
                className="flex w-full items-center justify-between font-medium"
                data-testid="inference-history-toggle"
              >
                <span>Inference History</span>
                <span className="text-xs text-muted-foreground">
                  {inferenceHistoryOpen ? '\u25B2' : '\u25BC'}
                </span>
              </button>
              {inferenceHistoryOpen ? (
                !inspect.inference_history?.length ? (
                  <p className="text-muted-foreground">
                    No inference history available.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid="inference-history-table">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="pb-1 pr-3 font-medium">Timestamp</th>
                          <th className="pb-1 pr-3 font-medium">Provider</th>
                          <th className="pb-1 pr-3 font-medium">Model</th>
                          <th className="pb-1 pr-3 font-medium text-right">In tokens</th>
                          <th className="pb-1 pr-3 font-medium text-right">Out tokens</th>
                          <th className="pb-1 font-medium text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...inspect.inference_history]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .slice(0, 50)
                          .map((entry, idx) => (
                            <tr key={`${entry.traceId}-${idx}`} className="border-b border-border/50">
                              <td className="py-1 pr-3 whitespace-nowrap">
                                {new Date(entry.timestamp).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </td>
                              <td className="py-1 pr-3">{entry.providerId}</td>
                              <td className="py-1 pr-3">{entry.modelId}</td>
                              <td className="py-1 pr-3 text-right tabular-nums">
                                {entry.inputTokens != null ? entry.inputTokens.toLocaleString() : '\u2014'}
                              </td>
                              <td className="py-1 pr-3 text-right tabular-nums">
                                {entry.outputTokens != null ? entry.outputTokens.toLocaleString() : '\u2014'}
                              </td>
                              <td className="py-1 text-right tabular-nums">
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
