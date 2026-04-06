'use client';

import * as React from 'react';
import type { MaoRunGraphSnapshot } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { formatShortId } from './mao-links';
import { getStateVisuals } from './mao-state-utils';

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
  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--nous-space-sm)',
  };

  const cellBase: React.CSSProperties = {
    borderRadius: 'var(--nous-radius-sm)',
    border: '1px solid var(--nous-border-subtle)',
    paddingInline: 'var(--nous-space-md)',
    paddingBlock: 'var(--nous-space-sm)',
  };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Run graph</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
            <Badge variant="outline">{graph.nodes.length} nodes</Badge>
            <Badge variant="outline">{graph.edges.length} edges</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-lg)', paddingTop: 'var(--nous-space-lg)' }}>
        <div style={sectionStyle}>
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>Nodes</div>
          {!graph.nodes.length ? (
            <p style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              No graph nodes are available for the selected run.
            </p>
          ) : (
            graph.nodes.map((node) => {
              const active =
                selectedNodeId != null &&
                (selectedNodeId === node.workflowNodeDefinitionId ||
                  selectedNodeId === node.id);

              const stateVisuals = node.state
                ? getStateVisuals(node.state)
                : null;
              const nodeStyle: React.CSSProperties = active
                ? { borderColor: 'var(--nous-accent)', backgroundColor: 'rgba(0,122,204,0.1)' }
                : stateVisuals
                  ? { ...stateVisuals.toneStyle }
                  : { borderColor: 'var(--nous-border-subtle)' };

              return (
                <button
                  key={node.id}
                  type="button"
                  data-testid="run-graph-node"
                  onClick={() =>
                    onSelectNode({
                      workflowRunId: node.workflowRunId,
                      nodeDefinitionId: node.workflowNodeDefinitionId ?? node.id,
                      agentId: node.agentId,
                    })
                  }
                  style={{
                    width: '100%',
                    borderRadius: 'var(--nous-radius-sm)',
                    border: '1px solid',
                    paddingInline: 'var(--nous-space-md)',
                    paddingBlock: 'var(--nous-space-sm)',
                    textAlign: 'left',
                    ...nodeStyle,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <span style={{ fontWeight: 500 }}>{node.label}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
                      <Badge variant="outline">{node.kind}</Badge>
                      {node.state ? <Badge variant="outline">{node.state}</Badge> : null}
                    </div>
                  </div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    node {formatShortId(node.workflowNodeDefinitionId ?? node.id)} •
                    evidence {node.evidenceRefs[0] ?? 'n/a'}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }}>Edges</div>
          {!graph.edges.length ? (
            <p style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              No dispatch or corrective arcs are available.
            </p>
          ) : (
            graph.edges.map((edge) => {
              const isCorrective = edge.kind !== 'dispatch';

              return (
                <div
                  key={edge.id}
                  data-testid={isCorrective ? 'corrective-arc' : undefined}
                  style={{
                    borderRadius: 'var(--nous-radius-sm)',
                    border: '1px solid',
                    paddingInline: 'var(--nous-space-md)',
                    paddingBlock: 'var(--nous-space-sm)',
                    fontSize: 'var(--nous-font-size-sm)',
                    ...(isCorrective
                      ? { borderColor: 'rgba(245,158,11,0.6)', backgroundColor: 'rgba(245,158,11,0.05)', borderLeftWidth: '2px', borderLeftColor: '#f59e0b' }
                      : { borderColor: 'var(--nous-border-subtle)' }),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <span style={{ fontWeight: 500 }}>
                      {formatShortId(edge.fromNodeId)} {'->'}{' '}
                      {formatShortId(edge.toNodeId)}
                    </span>
                    <Badge
                      variant="outline"
                      style={isCorrective ? { borderColor: '#f59e0b', color: '#f59e0b' } : {}}
                    >
                      {edge.kind}
                    </Badge>
                  </div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    {edge.reasonCode} • {edge.evidenceRefs[0]}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
