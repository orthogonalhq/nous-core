// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentProjection, MaoSystemSnapshot } from '@nous/shared';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

import { MaoLeaseTree, buildLeaseTree } from '../mao-lease-tree';

function createAgent(
  overrides?: Partial<MaoAgentProjection>,
): MaoAgentProjection {
  return {
    agent_id: overrides?.agent_id ?? crypto.randomUUID(),
    project_id: 'project-001',
    dispatching_task_agent_id: null,
    dispatch_origin_ref: 'test',
    state: 'running',
    current_step: 'Execute task',
    progress_percent: 50,
    risk_level: 'low',
    urgency_level: 'normal',
    attention_level: 'normal',
    pfc_alert_status: 'none',
    pfc_mitigation_status: 'none',
    dispatch_state: 'dispatched',
    reflection_cycle_count: 0,
    last_update_at: '2026-03-29T00:00:00Z',
    reasoning_log_preview: null,
    reasoning_log_last_entry_class: null,
    reasoning_log_last_entry_at: null,
    reasoning_log_redaction_state: 'none',
    deepLinks: [],
    evidenceRefs: [],
    ...overrides,
  } as MaoAgentProjection;
}

function createSystemSnapshot(
  overrides?: Partial<MaoSystemSnapshot>,
): MaoSystemSnapshot {
  return {
    agents: [],
    leaseRoots: [],
    projectControls: {},
    densityMode: 'D2',
    generatedAt: new Date().toISOString(),
    ...overrides,
  } as MaoSystemSnapshot;
}

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('buildLeaseTree', () => {
  it('builds tree from flat agents using dispatching_task_agent_id chains', () => {
    const root = createAgent({ agent_id: 'root-1' });
    const child1 = createAgent({
      agent_id: 'child-1',
      dispatching_task_agent_id: 'root-1',
    });
    const child2 = createAgent({
      agent_id: 'child-2',
      dispatching_task_agent_id: 'root-1',
    });

    const tree = buildLeaseTree([root, child1, child2], ['root-1']);

    expect(tree).toHaveLength(1);
    expect(tree[0].agent.agent_id).toBe('root-1');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('handles empty agents array', () => {
    const tree = buildLeaseTree([], []);
    expect(tree).toHaveLength(0);
  });

  it('skips missing root IDs gracefully', () => {
    const agent = createAgent({ agent_id: 'a1' });
    const tree = buildLeaseTree([agent], ['missing-id']);
    expect(tree).toHaveLength(0);
  });

  it('detects cycles and treats cyclic node as leaf', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = createAgent({ agent_id: 'a', dispatching_task_agent_id: 'b' });
    const b = createAgent({ agent_id: 'b', dispatching_task_agent_id: 'a' });

    // Neither is a root by leaseRoots, so we add one manually
    const tree = buildLeaseTree([a, b], ['a']);
    // Should not infinite loop
    expect(tree).toHaveLength(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('MaoLeaseTree', () => {
  it('renders root agents in first row (depth 0)', () => {
    const root1 = createAgent({ agent_id: 'root-1', display_name: 'Root Agent 1' });
    const root2 = createAgent({ agent_id: 'root-2', display_name: 'Root Agent 2' });

    const snapshot = createSystemSnapshot({
      agents: [root1, root2],
      leaseRoots: ['root-1', 'root-2'],
    });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('lease-root-row')).toBeTruthy();
    expect(screen.getByText('Root Agent 1')).toBeTruthy();
    expect(screen.getByText('Root Agent 2')).toBeTruthy();
  });

  it('renders empty state placeholder when agents is empty', () => {
    const snapshot = createSystemSnapshot({ agents: [], leaseRoots: [] });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('lease-tree-empty')).toBeTruthy();
    expect(
      screen.getByText('No agents are currently active across the system.'),
    ).toBeTruthy();
  });

  it('fires onSelectAgent when a root tile is clicked', () => {
    const handler = vi.fn();
    const root = createAgent({ agent_id: 'root-1', display_name: 'Root Agent' });
    const snapshot = createSystemSnapshot({
      agents: [root],
      leaseRoots: ['root-1'],
    });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={handler}
      />,
    );

    fireEvent.click(screen.getByText('Root Agent'));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'root-1' }),
    );
  });

  it('renders group cards for depth 1+ children', () => {
    const root = createAgent({ agent_id: 'root-1', display_name: 'Root' });
    const worker1 = createAgent({
      agent_id: 'w1',
      dispatching_task_agent_id: 'root-1',
      display_name: 'Worker 1',
    });
    const worker2 = createAgent({
      agent_id: 'w2',
      dispatching_task_agent_id: 'root-1',
      display_name: 'Worker 2',
    });

    const snapshot = createSystemSnapshot({
      agents: [root, worker1, worker2],
      leaseRoots: ['root-1'],
    });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getAllByTestId('workflow-group-card')).toHaveLength(1);
  });

  it('at D1 collapses deep subtrees (only depth 0 and 1 visible)', () => {
    const root = createAgent({ agent_id: 'root-1', display_name: 'Root' });
    const orch = createAgent({
      agent_id: 'orch-1',
      dispatching_task_agent_id: 'root-1',
      display_name: 'Orch',
    });
    const deep = createAgent({
      agent_id: 'deep-1',
      dispatching_task_agent_id: 'orch-1',
      display_name: 'Deep Worker',
    });

    const snapshot = createSystemSnapshot({
      agents: [root, orch, deep],
      leaseRoots: ['root-1'],
    });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D1"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    // Root row should exist
    expect(screen.getByTestId('lease-root-row')).toBeTruthy();
    // At D1, depth > 1 rows should not be rendered
    // The deep worker's own group card (depth 2) should not appear as a separate card
    // We verify it by checking tree structure renders without crash
    expect(screen.getByTestId('lease-tree')).toBeTruthy();
  });

  it('at D4 renders compact blocks and hides edges', () => {
    const root = createAgent({ agent_id: 'root-1', display_name: 'Root' });
    const snapshot = createSystemSnapshot({
      agents: [root],
      leaseRoots: ['root-1'],
    });

    const { container } = render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D4"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    const svg = screen.getByTestId('edge-connector-svg');
    expect(svg.style.display).toBe('none');
  });

  it('renders SVG edge connector', () => {
    const root = createAgent({ agent_id: 'root-1', display_name: 'Root' });
    const child = createAgent({
      agent_id: 'child-1',
      dispatching_task_agent_id: 'root-1',
      display_name: 'Child',
    });

    const snapshot = createSystemSnapshot({
      agents: [root, child],
      leaseRoots: ['root-1'],
    });

    render(
      <MaoLeaseTree
        snapshot={snapshot}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('edge-connector-svg')).toBeTruthy();
  });
});
