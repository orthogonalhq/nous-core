'use client';

import * as React from 'react';
import type { MaoRunGraphSnapshot } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { formatShortId } from './mao-links';

export interface MaoRunGraphProps {
  graph: MaoRunGraphSnapshot;
  selectedNodeId: string | null;
  onSelectNode: (input: {
    workflowRunId?: string | null;
    nodeDefinitionId?: string | null;
    agentId?: string | null;
  }) => void;
}

export function MaoRunGraph({
  graph,
  selectedNodeId,
  onSelectNode,
}: MaoRunGraphProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Run graph</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{graph.nodes.length} nodes</Badge>
            <Badge variant="outline">{graph.edges.length} edges</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="text-sm font-medium">Nodes</div>
          {!graph.nodes.length ? (
            <p className="text-sm text-muted-foreground">
              No graph nodes are available for the selected run.
            </p>
          ) : (
            graph.nodes.map((node) => {
              const active =
                selectedNodeId != null &&
                (selectedNodeId === node.workflowNodeDefinitionId ||
                  selectedNodeId === node.id);

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() =>
                    onSelectNode({
                      workflowRunId: node.workflowRunId,
                      nodeDefinitionId: node.workflowNodeDefinitionId ?? node.id,
                      agentId: node.agentId,
                    })
                  }
                  className={`w-full rounded-md border px-3 py-2 text-left ${
                    active
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{node.label}</span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{node.kind}</Badge>
                      {node.state ? <Badge variant="outline">{node.state}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    node {formatShortId(node.workflowNodeDefinitionId ?? node.id)} •
                    evidence {node.evidenceRefs[0] ?? 'n/a'}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Edges</div>
          {!graph.edges.length ? (
            <p className="text-sm text-muted-foreground">
              No dispatch or corrective arcs are available.
            </p>
          ) : (
            graph.edges.map((edge) => (
              <div
                key={edge.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatShortId(edge.fromNodeId)} {'->'}{' '}
                    {formatShortId(edge.toNodeId)}
                  </span>
                  <Badge variant="outline">{edge.kind}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {edge.reasonCode} • {edge.evidenceRefs[0]}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
