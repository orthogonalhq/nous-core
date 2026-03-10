'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ProjectWorkflowSurfaceSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MaoNavigationContext } from '@/lib/mao-links';
import { buildMaoReturnHref } from '@/lib/mao-links';
import {
  createDefaultWorkflowDigestState,
  WorkflowDigestControls,
  type WorkflowDigestState,
} from './workflow-digest-controls';
import { WorkflowEmptyState } from './workflow-empty-state';
import { WorkflowNodeDetail } from './workflow-node-detail';
import { WorkflowRunList } from './workflow-run-list';

interface WorkflowMonitorProps {
  snapshot: ProjectWorkflowSurfaceSnapshot;
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
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const deferredQuery = React.useDeferredValue(digestState.query.trim().toLowerCase());

  React.useEffect(() => {
    if (!snapshot.nodeProjections.length) {
      setSelectedNodeId(null);
      return;
    }

    if (
      linkedNodeId &&
      snapshot.nodeProjections.some((node) => node.nodeDefinitionId === linkedNodeId)
    ) {
      setSelectedNodeId(linkedNodeId);
      return;
    }

    if (
      selectedNodeId == null ||
      !snapshot.nodeProjections.some((node) => node.nodeDefinitionId === selectedNodeId)
    ) {
      setSelectedNodeId(snapshot.nodeProjections[0]?.nodeDefinitionId ?? null);
    }
  }, [linkedNodeId, selectedNodeId, snapshot.nodeProjections]);

  const filteredNodes = snapshot.nodeProjections.filter((node) => {
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

  const groupedNodes = filteredNodes.reduce<Record<string, typeof filteredNodes>>(
    (groups, node) => {
      const key =
        digestState.groupBy === 'status' ? node.status : node.definition.type;
      groups[key] = [...(groups[key] ?? []), node];
      return groups;
    },
    {},
  );

  const selectedNode =
    filteredNodes.find((node) => node.nodeDefinitionId === selectedNodeId) ?? null;

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
                MAO evidence handoff active.
                <Link
                  href={buildMaoReturnHref(maoContext)}
                  className="ml-2 underline underline-offset-4"
                >
                  Return to MAO
                </Link>
              </div>
            ) : null}
            <p>runtime posture: {snapshot.diagnostics.runtimePosture}</p>
            <p>inspect-first mode: {snapshot.diagnostics.inspectFirstMode}</p>
            {snapshot.diagnostics.degradedReasonCode ? (
              <p>diagnostic: {snapshot.diagnostics.degradedReasonCode}</p>
            ) : null}
            {snapshot.controlProjection ? (
              <p>control state: {snapshot.controlProjection.project_control_state}</p>
            ) : null}
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
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>{snapshot.workflowDefinition?.name ?? 'Workflow'}</span>
                <Badge variant="outline">
                  {snapshot.graph.topologicalOrder.length} nodes
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <WorkflowDigestControls
                state={digestState}
                nodeCount={snapshot.nodeProjections.length}
                onChange={(next) =>
                  setDigestState((current) => ({ ...current, ...next }))
                }
              />

              {Object.keys(groupedNodes).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No nodes match the current digest filters.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedNodes).map(([groupKey, nodes]) => {
                    const collapsed = collapsedGroups[groupKey] ?? false;
                    return (
                      <div key={groupKey} className="rounded-md border border-border">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                          onClick={() =>
                            setCollapsedGroups((current) => ({
                              ...current,
                              [groupKey]: !collapsed,
                            }))
                          }
                        >
                          <span className="font-medium">{groupKey}</span>
                          <span className="text-muted-foreground">
                            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
                          </span>
                        </button>
                        {!collapsed ? (
                          <div className="space-y-2 border-t border-border px-3 py-3">
                            {nodes.map((node) => (
                              <button
                                key={node.nodeDefinitionId}
                                type="button"
                                onClick={() => setSelectedNodeId(node.nodeDefinitionId)}
                                className={`w-full rounded-md border px-3 py-2 text-left ${
                                  selectedNodeId === node.nodeDefinitionId
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:bg-muted/20'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{node.definition.name}</span>
                                  <Badge variant="outline">{node.status}</Badge>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {node.definition.type} • {node.nodeDefinitionId.slice(0, 8)}...
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="text-base">Recent artifacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4 text-sm">
              {!snapshot.recentArtifacts.length ? (
                <p className="text-muted-foreground">No committed artifacts in the current snapshot.</p>
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
                <p className="text-muted-foreground">No traces available for this project.</p>
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
      </div>

      <WorkflowNodeDetail
        node={selectedNode}
        recentArtifacts={snapshot.recentArtifacts}
        recentTraces={snapshot.recentTraces}
      />
    </div>
  );
}
