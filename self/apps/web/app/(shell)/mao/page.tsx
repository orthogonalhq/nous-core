'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';

export default function MaoPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8">
          <p className="text-muted-foreground">Loading MAO projection...</p>
        </div>
      }
    >
      <MaoPageContent />
    </React.Suspense>
  );
}

function MaoPageContent() {
  const { projectId } = useProject();
  const searchParams = useSearchParams();
  const linkedRunId = searchParams.get('runId');
  const linkedNodeId = searchParams.get('nodeId');
  const controlProjection = trpc.mao.getProjectControlProjection.useQuery(
    { projectId: projectId as any },
    { enabled: projectId != null },
  );
  const agentProjections = trpc.mao.getAgentProjections.useQuery(
    { projectId: projectId as any },
    { enabled: projectId != null },
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project to inspect MAO projections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">MAO Projection</h1>
        <p className="text-sm text-muted-foreground">
          Forward-linked projection view for workflow monitoring references.
        </p>
      </div>

      {linkedRunId || linkedNodeId ? (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Linked context
          {linkedRunId ? ` run ${linkedRunId.slice(0, 8)}` : ''}
          {linkedNodeId ? ` node ${linkedNodeId.slice(0, 8)}` : ''}.
        </div>
      ) : null}

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Project control</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!controlProjection.data ? (
            <p className="text-sm text-muted-foreground">
              No MAO control projection available for this project.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {controlProjection.data.project_control_state}
                </Badge>
                <span>{controlProjection.data.pfc_project_recommendation}</span>
              </div>
              <p className="text-muted-foreground">
                active agents {controlProjection.data.active_agent_count} • blocked{' '}
                {controlProjection.data.blocked_agent_count} • urgent{' '}
                {controlProjection.data.urgent_agent_count}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Agent projections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {!agentProjections.data?.length ? (
            <p className="text-sm text-muted-foreground">
              No agent projections available.
            </p>
          ) : (
            agentProjections.data.map((agent) => (
              <div
                key={agent.agent_id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{agent.current_step}</span>
                  <Badge variant="outline">{agent.state}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  risk {agent.risk_level} • attention {agent.attention_level}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
