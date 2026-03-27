'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  ArtifactVersionRecord,
  WorkflowNodeInspectProjection,
  WorkflowSurfaceLink,
  WorkflowTraceSummary,
} from '@nous/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';

function buildHref(link: WorkflowSurfaceLink): string | null {
  const params = new URLSearchParams();
  params.set('projectId', link.projectId);
  if (link.workflowRunId) {
    params.set('runId', link.workflowRunId);
  }
  if (link.nodeDefinitionId) {
    params.set('nodeId', link.nodeDefinitionId);
  }
  if (link.traceId) {
    params.set('traceId', link.traceId);
  }
  if (link.evidenceRef) {
    params.set('evidenceRef', link.evidenceRef);
  }

  switch (link.target) {
    case 'chat':
      return `/chat?${params.toString()}`;
    case 'traces':
      return `/traces?${params.toString()}`;
    case 'mao':
      params.set('source', 'mao');
      return `/mao?${params.toString()}`;
    case 'artifact':
    default:
      return null;
  }
}

interface WorkflowNodeDetailProps {
  inspect: WorkflowNodeInspectProjection | null;
  recentArtifacts: ArtifactVersionRecord[];
  recentTraces: WorkflowTraceSummary[];
}

export function WorkflowNodeDetail({
  inspect,
  recentArtifacts,
  recentTraces,
}: WorkflowNodeDetailProps) {
  if (!inspect) {
    return (
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Node detail</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Select a node to inspect checkpoint posture, correction arcs, artifacts,
          and linked surfaces.
        </CardContent>
      </Card>
    );
  }

  const { monitor, maoInspect } = inspect;
  const matchingArtifacts = recentArtifacts.filter((artifact) =>
    inspect.artifactRefs.includes(artifact.artifactRef),
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{monitor.definition.name}</span>
          <Badge variant="outline">{monitor.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Node type</div>
            <div>{monitor.definition.type}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Governance</div>
            <div>{monitor.definition.governance}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Execution model</div>
            <div>{monitor.definition.executionModel}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Policy reason</div>
            <div>{inspect.policyReasonCode ?? 'n/a'}</div>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="font-medium">Checkpoint posture</div>
          <div className="mt-2 text-xs text-muted-foreground">
            state {inspect.checkpointSummary.runCheckpointState}
          </div>
          {inspect.checkpointSummary.lastPreparedCheckpointId ? (
            <div className="text-xs text-muted-foreground">
              prepared {inspect.checkpointSummary.lastPreparedCheckpointId.slice(0, 8)}...
            </div>
          ) : null}
          {inspect.checkpointSummary.lastCommittedCheckpointId ? (
            <div className="text-xs text-muted-foreground">
              committed {inspect.checkpointSummary.lastCommittedCheckpointId.slice(0, 8)}...
            </div>
          ) : null}
        </div>

        {monitor.nodeState?.attempts.length ? (
          <div className="space-y-2">
            <div className="font-medium">Attempts</div>
            {monitor.nodeState.attempts.map((attempt) => (
              <div
                key={attempt.attempt}
                className="rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>Attempt {attempt.attempt}</span>
                  <Badge variant="outline">{attempt.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {attempt.reasonCode}
                </div>
                {attempt.waitState ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    wait {attempt.waitState.kind}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {maoInspect ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="font-medium">MAO inspect reuse</div>
            <div className="text-xs text-muted-foreground">
              run status {maoInspect.runStatus ?? 'n/a'}
              {maoInspect.waitKind ? ` • wait ${maoInspect.waitKind}` : ''}
            </div>
            {maoInspect.latestAttempt ? (
              <div className="text-xs text-muted-foreground">
                latest attempt {maoInspect.latestAttempt.attempt} •{' '}
                {maoInspect.latestAttempt.status} • {maoInspect.latestAttempt.reasonCode}
              </div>
            ) : null}
            {maoInspect.correctionArcs.length ? (
              <div className="space-y-2">
                {maoInspect.correctionArcs.map((arc) => (
                  <div
                    key={arc.id}
                    className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
                  >
                    {arc.type} • {arc.reasonCode}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="font-medium">Linked surfaces</div>
          <div className="flex flex-wrap gap-2">
            {monitor.deepLinks.map((link, index) => {
              const href = buildHref(link);
              const label = link.target === 'artifact'
                ? link.artifactRef ?? 'artifact'
                : link.target;
              return href ? (
                <Link
                  key={`${link.target}-${index}`}
                  href={href}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/20"
                >
                  {label}
                </Link>
              ) : (
                <span
                  key={`${link.target}-${index}`}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="font-medium">Artifacts</div>
          {!matchingArtifacts.length ? (
            <p className="text-muted-foreground">No node-linked artifacts in the current snapshot.</p>
          ) : (
            <div className="space-y-2">
              {matchingArtifacts.map((artifact) => (
                <div
                  key={artifact.artifactRef}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="font-medium">{artifact.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {artifact.artifactRef} • {artifact.mimeType}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="font-medium">Recent traces</div>
          {!recentTraces.length ? (
            <p className="text-muted-foreground">No project traces available.</p>
          ) : (
            <div className="space-y-2">
              {recentTraces.slice(0, 3).map((trace) => (
                <Link
                  key={trace.traceId}
                  href={`/traces?projectId=${monitor.deepLinks[0]?.projectId ?? ''}&traceId=${trace.traceId}`}
                  className="block rounded-md border border-border px-3 py-2 hover:bg-muted/20"
                >
                  <div className="font-medium">{trace.traceId.slice(0, 8)}...</div>
                  <div className="text-xs text-muted-foreground">
                    {trace.turnCount} turn{trace.turnCount !== 1 ? 's' : ''}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
