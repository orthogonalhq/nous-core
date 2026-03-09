'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  ArtifactVersionRecord,
  WorkflowNodeMonitorProjection,
  WorkflowSurfaceLink,
  WorkflowTraceSummary,
} from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  switch (link.target) {
    case 'chat':
      return `/chat?${params.toString()}`;
    case 'traces':
      return `/traces?${params.toString()}`;
    case 'mao':
      return `/mao?${params.toString()}`;
    case 'artifact':
    default:
      return null;
  }
}

interface WorkflowNodeDetailProps {
  node: WorkflowNodeMonitorProjection | null;
  recentArtifacts: ArtifactVersionRecord[];
  recentTraces: WorkflowTraceSummary[];
}

export function WorkflowNodeDetail({
  node,
  recentArtifacts,
  recentTraces,
}: WorkflowNodeDetailProps) {
  if (!node) {
    return (
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Node detail</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Select a node to inspect runtime, artifacts, and shared-reference links.
        </CardContent>
      </Card>
    );
  }

  const matchingArtifacts = recentArtifacts.filter((artifact) =>
    node.artifactRefs.includes(artifact.artifactRef),
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{node.definition.name}</span>
          <Badge variant="outline">{node.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Node type</div>
            <div>{node.definition.type}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Governance</div>
            <div>{node.definition.governance}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Execution model</div>
            <div>{node.definition.executionModel}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Attempts</div>
            <div>{node.nodeState?.attempts.length ?? 0}</div>
          </div>
        </div>

        {node.nodeState?.attempts.length ? (
          <div className="space-y-2">
            <div className="font-medium">Attempts</div>
            {node.nodeState.attempts.map((attempt) => (
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
                {attempt.outputRef ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    output {attempt.outputRef}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="font-medium">Linked surfaces</div>
          <div className="flex flex-wrap gap-2">
            {node.deepLinks.map((link, index) => {
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
                  href={`/traces?projectId=${node.deepLinks[0]?.projectId ?? ''}&traceId=${trace.traceId}`}
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
