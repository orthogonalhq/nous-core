'use client';

import * as React from 'react';
import type { WorkflowVisualDebugSnapshot } from '@nous/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@nous/ui';
import type { MaoNavigationContext } from '@/lib/mao-links';
import { buildMaoReturnHref } from '@/lib/mao-links';
import { trpc } from '@/lib/trpc';
import {
  createDefaultWorkflowDigestState,
  WorkflowDigestControls,
  type WorkflowDigestState,
} from './workflow-digest-controls';
import { WorkflowEmptyState } from './workflow-empty-state';
import { WorkflowGraphCanvas } from './workflow-graph-canvas';
import { WorkflowNodeDetail } from './workflow-node-detail';
import { WorkflowRunList } from './workflow-run-list';
import { WorkflowVisualDebugPanel } from './workflow-visual-debug-panel';

interface WorkflowMonitorProps {
  snapshot: WorkflowVisualDebugSnapshot;
  selectedRunId: string | null;
  linkedNodeId?: string | null;
  maoContext?: MaoNavigationContext | null;
  onSelectRun: (runId: string | null) => void;
  onStartAuthoring: () => void;
}

export function WorkflowMonitor({
  snapshot,
  selectedRunId,
  linkedNodeId,
  maoContext,
  onSelectRun,
  onStartAuthoring,
}: WorkflowMonitorProps) {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [digestState, setDigestState] = React.useState<WorkflowDigestState>(
    createDefaultWorkflowDigestState(),
  );
  const deferredQuery = React.useDeferredValue(digestState.query.trim().toLowerCase());

  React.useEffect(() => {
    if (!snapshot.canvasNodes.length) {
      setSelectedNodeId(null);
      return;
    }

    if (
      linkedNodeId &&
      snapshot.canvasNodes.some((node) => node.nodeDefinitionId === linkedNodeId)
    ) {
      setSelectedNodeId(linkedNodeId);
      return;
    }

    if (
      selectedNodeId == null ||
      !snapshot.canvasNodes.some((node) => node.nodeDefinitionId === selectedNodeId)
    ) {
      setSelectedNodeId(snapshot.canvasNodes[0]?.nodeDefinitionId ?? null);
    }
  }, [linkedNodeId, selectedNodeId, snapshot.canvasNodes]);

  const filteredCanvasNodes = snapshot.canvasNodes.filter((node) => {
    if (digestState.hideCompleted && node.status === 'completed') {
      return false;
    }
    if (digestState.status !== 'all' && node.status !== digestState.status) {
      return false;
    }
    if (!deferredQuery) {
      return true;
    }
    return (
      node.definition.name.toLowerCase().includes(deferredQuery) ||
      node.nodeDefinitionId.toLowerCase().includes(deferredQuery)
    );
  });

  const inspectQuery = trpc.projects.workflowNodeInspect.useQuery(
    {
      projectId: snapshot.project.id as any,
      runId: (selectedRunId ?? snapshot.selectedRunId) as any,
      nodeDefinitionId: selectedNodeId as any,
    },
    {
      enabled: selectedNodeId != null,
    },
  );

  const filteredSnapshot: WorkflowVisualDebugSnapshot = {
    ...snapshot,
    canvasNodes: filteredCanvasNodes,
    stages: snapshot.stages
      .map((stage) => ({
        ...stage,
        nodeDefinitionIds: stage.nodeDefinitionIds.filter((nodeDefinitionId) =>
          filteredCanvasNodes.some((node) => node.nodeDefinitionId === nodeDefinitionId),
        ),
      }))
      .filter((stage) => stage.nodeDefinitionIds.length > 0),
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <WorkflowRunList
          runtimeAvailability={snapshot.runtimeAvailability}
          recentRuns={snapshot.recentRuns}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
        />

        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base">Projection diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
            {maoContext ? (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                MAO-origin monitoring context is active.
                <a
                  href={buildMaoReturnHref(maoContext)}
                  className="ml-2 underline underline-offset-4"
                >
                  Return to MAO
                </a>
              </div>
            ) : null}
            <p>runtime posture: {snapshot.diagnostics.runtimePosture}</p>
            <p>inspect-first mode: {snapshot.diagnostics.inspectFirstMode}</p>
            <p>graph parity: {snapshot.diagnostics.graphProjectionParity}</p>
            {snapshot.diagnostics.degradedReasonCode ? (
              <p>diagnostic: {snapshot.diagnostics.degradedReasonCode}</p>
            ) : null}
            {snapshot.controlProjection ? (
              <p>control state: {snapshot.controlProjection.project_control_state}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base">Canvas filters</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <WorkflowDigestControls
              state={digestState}
              nodeCount={snapshot.canvasNodes.length}
              onChange={(next) =>
                setDigestState((current) => ({ ...current, ...next }))
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {!snapshot.graph ? (
          <WorkflowEmptyState
            projectType={snapshot.project.type}
            reasonCode={snapshot.diagnostics.degradedReasonCode}
            onStartAuthoring={onStartAuthoring}
          />
        ) : (
          <>
            <WorkflowGraphCanvas
              snapshot={filteredSnapshot}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
            <WorkflowVisualDebugPanel snapshot={snapshot} />

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="border-b border-border">
                  <CardTitle className="text-base">Recent artifacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-4 text-sm">
                  {!snapshot.recentArtifacts.length ? (
                    <p className="text-muted-foreground">
                      No committed artifacts in the current snapshot.
                    </p>
                  ) : (
                    snapshot.recentArtifacts.map((artifact) => (
                      <div
                        key={artifact.artifactRef}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <div className="font-medium">{artifact.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {artifact.artifactRef}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b border-border">
                  <CardTitle className="text-base">Recent traces</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-4 text-sm">
                  {!snapshot.recentTraces.length ? (
                    <p className="text-muted-foreground">
                      No traces available for this project.
                    </p>
                  ) : (
                    snapshot.recentTraces.map((trace) => (
                      <a
                        key={trace.traceId}
                        href={`/traces?projectId=${snapshot.project.id}&traceId=${trace.traceId}`}
                        className="block rounded-md border border-border px-3 py-2 hover:bg-muted/20"
                      >
                        <div className="font-medium">{trace.traceId.slice(0, 8)}...</div>
                        <div className="text-xs text-muted-foreground">
                          {trace.turnCount} turn{trace.turnCount !== 1 ? 's' : ''}
                        </div>
                      </a>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {snapshot.maoRunGraph ? (
              <Card>
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span>MAO parity summary</span>
                    <Badge variant="outline">{snapshot.maoRunGraph.nodes.length} MAO nodes</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 pt-4 md:grid-cols-2">
                  {snapshot.maoRunGraph.edges.map((edge) => (
                    <div
                      key={edge.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <div className="font-medium">{edge.kind}</div>
                      <div className="text-xs text-muted-foreground">
                        {edge.reasonCode}
                      </div>
                    </div>
                  ))}
                  {!snapshot.maoRunGraph.edges.length ? (
                    <p className="text-sm text-muted-foreground">
                      No MAO corrective or dispatch edges are available for the selected run.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>

      <WorkflowNodeDetail
        inspect={inspectQuery.data ?? null}
        recentArtifacts={snapshot.recentArtifacts}
        recentTraces={snapshot.recentTraces}
      />
    </div>
  );
}
