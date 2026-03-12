'use client';

import * as React from 'react';
import type { WorkflowVisualDebugSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WorkflowGraphCanvasProps {
  snapshot: WorkflowVisualDebugSnapshot;
  selectedNodeId: string | null;
  onSelectNode: (nodeDefinitionId: string) => void;
}

export function WorkflowGraphCanvas({
  snapshot,
  selectedNodeId,
  onSelectNode,
}: WorkflowGraphCanvasProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Visual workflow canvas</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{snapshot.stages.length} stages</Badge>
            <Badge variant="outline">{snapshot.canvasNodes.length} nodes</Badge>
            <Badge variant="outline">{snapshot.canvasEdges.length} edges</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-4 xl:grid-cols-3">
          {snapshot.stages.map((stage) => (
            <section
              key={stage.id}
              className="rounded-xl border border-border bg-muted/10 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{stage.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {stage.kind} stage
                  </div>
                </div>
                <Badge variant="outline">{stage.nodeDefinitionIds.length}</Badge>
              </div>

              <div className="space-y-3">
                {stage.nodeDefinitionIds.map((nodeDefinitionId) => {
                  const node = snapshot.canvasNodes.find(
                    (candidate) => candidate.nodeDefinitionId === nodeDefinitionId,
                  );
                  if (!node) {
                    return null;
                  }

                  return (
                    <button
                      key={node.nodeDefinitionId}
                      type="button"
                      onClick={() => onSelectNode(node.nodeDefinitionId)}
                      className={`w-full rounded-lg border px-3 py-3 text-left ${
                        selectedNodeId === node.nodeDefinitionId
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{node.definition.name}</span>
                        <Badge variant="outline">{node.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {node.definition.type} • col {node.column + 1} • row {node.row + 1}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{node.isEntry ? 'entry' : 'step'}</span>
                        <span>{node.isActive ? 'active' : 'inactive'}</span>
                        <span>{node.artifactCount} artifacts</span>
                        {node.latestReasonCode ? <span>{node.latestReasonCode}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Edge activity</div>
              <div className="text-xs text-muted-foreground">
                Canonical branch, activation, and blocked-path projection
              </div>
            </div>
            <Badge variant="outline">{snapshot.diagnostics.graphProjectionParity}</Badge>
          </div>
          {!snapshot.canvasEdges.length ? (
            <p className="text-sm text-muted-foreground">
              No workflow edges are currently defined.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {snapshot.canvasEdges.map((edgeProjection) => (
                <div
                  key={edgeProjection.edge.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {edgeProjection.edge.from.slice(0, 8)}... {'->'}{' '}
                      {edgeProjection.edge.to.slice(0, 8)}...
                    </span>
                    <Badge variant="outline">{edgeProjection.state}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {edgeProjection.isBranchEdge
                      ? `branch ${edgeProjection.branchKey ?? 'default'}`
                      : 'default path'}
                    {edgeProjection.reasonCode ? ` • ${edgeProjection.reasonCode}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
