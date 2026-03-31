// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoRunGraphSnapshot, MaoRunGraphNode, MaoRunGraphEdge } from '@nous/shared';
import { MaoRunGraph } from '../mao-run-graph';

function createNode(overrides?: Partial<MaoRunGraphNode>): MaoRunGraphNode {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    kind: 'agent',
    label: 'Test Node',
    evidenceRefs: ['ref-001'],
    ...overrides,
  } as MaoRunGraphNode;
}

function createEdge(overrides?: Partial<MaoRunGraphEdge>): MaoRunGraphEdge {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    kind: 'dispatch',
    fromNodeId: 'node-a',
    toNodeId: 'node-b',
    reasonCode: 'test-reason',
    evidenceRefs: ['ref-001'],
    occurredAt: '2026-03-29T00:00:00Z',
    ...overrides,
  } as MaoRunGraphEdge;
}

function createGraph(
  nodes: MaoRunGraphNode[],
  edges: MaoRunGraphEdge[],
): MaoRunGraphSnapshot {
  return {
    projectId: 'project-001',
    nodes,
    edges,
    generatedAt: '2026-03-29T00:00:00Z',
  } as MaoRunGraphSnapshot;
}

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('MaoRunGraph node color-coding', () => {
  it('renders running node with emerald border', () => {
    const node = createNode({ id: 'n1', label: 'Running Node', state: 'running' });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-emerald-500/40');
    expect(nodeEl.className).toContain('bg-emerald-500/10');
  });

  it('renders blocked node with amber border', () => {
    const node = createNode({ id: 'n1', label: 'Blocked Node', state: 'blocked' });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-amber-500/40');
    expect(nodeEl.className).toContain('bg-amber-500/10');
  });

  it('renders failed node with red border', () => {
    const node = createNode({ id: 'n1', label: 'Failed Node', state: 'failed' });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-red-500/40');
    expect(nodeEl.className).toContain('bg-red-500/10');
  });

  it('renders completed node with slate border', () => {
    const node = createNode({ id: 'n1', label: 'Done Node', state: 'completed' });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-slate-500/40');
  });

  it('renders neutral styling when node state is undefined', () => {
    const node = createNode({ id: 'n1', label: 'No State Node' });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-border');
  });

  it('selected node overrides state color with border-primary', () => {
    const node = createNode({
      id: 'n1',
      label: 'Selected Node',
      state: 'running',
      workflowNodeDefinitionId: 'wnd-1' as any,
    });
    const graph = createGraph([node], []);

    const { container } = render(
      <MaoRunGraph graph={graph} selectedNodeId="wnd-1" onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node');
    expect(nodeEl.className).toContain('border-primary');
    expect(nodeEl.className).toContain('bg-primary/10');
  });
});

describe('MaoRunGraph corrective arc emphasis', () => {
  it('renders dispatch arc with neutral border-border', () => {
    const edge = createEdge({ id: 'e1', kind: 'dispatch' });
    const graph = createGraph([], [edge]);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    expect(screen.queryByTestId('corrective-arc')).toBeNull();
  });

  it('renders rollback arc with corrective emphasis', () => {
    const edge = createEdge({ id: 'e1', kind: 'rollback' });
    const graph = createGraph([], [edge]);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const correctiveArc = screen.getByTestId('corrective-arc');
    expect(correctiveArc).toBeTruthy();
    expect(correctiveArc.className).toContain('border-amber-500/60');
    expect(correctiveArc.className).toContain('bg-amber-500/5');
    expect(correctiveArc.className).toContain('border-l-amber-500');
  });

  it.each([
    'reflection_review',
    'retry',
    'rollback',
    'reprompt',
    'resume',
  ] as const)('renders %s edge with corrective-arc test id', (kind) => {
    const edge = createEdge({ id: `e-${kind}`, kind });
    const graph = createGraph([], [edge]);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    expect(screen.getByTestId('corrective-arc')).toBeTruthy();
    cleanup();
  });
});

describe('MaoRunGraph click handler', () => {
  it('fires onSelectNode with correct payload when node is clicked', () => {
    const handler = vi.fn();
    const node = createNode({
      id: 'n1',
      label: 'Clickable Node',
      workflowRunId: 'run-001' as any,
      workflowNodeDefinitionId: 'wnd-001' as any,
      agentId: 'agent-001',
    });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={handler} />,
    );

    fireEvent.click(screen.getByTestId('run-graph-node'));
    expect(handler).toHaveBeenCalledWith({
      workflowRunId: 'run-001',
      nodeDefinitionId: 'wnd-001',
      agentId: 'agent-001',
    });
  });
});
