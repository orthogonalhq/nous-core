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
  it('renders running node with active tone border', () => {
    const node = createNode({ id: 'n1', label: 'Running Node', state: 'running' });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-state-active-tone-border)');
    expect(nodeEl.style.backgroundColor).toBe('var(--nous-state-active-tone-bg)');
  });

  it('renders blocked node with waiting tone border', () => {
    const node = createNode({ id: 'n1', label: 'Blocked Node', state: 'blocked' });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-state-waiting-tone-border)');
    expect(nodeEl.style.backgroundColor).toBe('var(--nous-state-waiting-tone-bg)');
  });

  it('renders failed node with blocked tone border', () => {
    const node = createNode({ id: 'n1', label: 'Failed Node', state: 'failed' });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-state-blocked-tone-border)');
    expect(nodeEl.style.backgroundColor).toBe('var(--nous-state-blocked-tone-bg)');
  });

  it('renders completed node with complete tone border', () => {
    const node = createNode({ id: 'n1', label: 'Done Node', state: 'completed' });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-state-complete-tone-border)');
  });

  it('renders neutral styling when node state is undefined', () => {
    const node = createNode({ id: 'n1', label: 'No State Node' });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId={null} onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-border-subtle)');
  });

  it('selected node overrides state color with accent border', () => {
    const node = createNode({
      id: 'n1',
      label: 'Selected Node',
      state: 'running',
      workflowNodeDefinitionId: 'wnd-1' as any,
    });
    const graph = createGraph([node], []);

    render(
      <MaoRunGraph graph={graph} selectedNodeId="wnd-1" onSelectNode={noop} />,
    );

    const nodeEl = screen.getByTestId('run-graph-node') as HTMLElement;
    expect(nodeEl.style.borderColor).toBe('var(--nous-accent)');
    expect(nodeEl.style.backgroundColor).toContain('rgba(0');
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

    const correctiveArc = screen.getByTestId('corrective-arc') as HTMLElement;
    expect(correctiveArc).toBeTruthy();
    expect(correctiveArc.style.borderColor).toContain('rgba(245');
    expect(correctiveArc.style.backgroundColor).toContain('rgba(245');
    expect(correctiveArc.style.borderLeftColor).toContain('rgb(245');
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
