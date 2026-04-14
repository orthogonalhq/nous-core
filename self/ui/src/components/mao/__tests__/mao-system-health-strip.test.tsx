// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentProjection, MaoSystemSnapshot, ProjectId } from '@nous/shared';
import { MaoSystemHealthStrip } from '../mao-system-health-strip';

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('MaoSystemHealthStrip', () => {
  it('displays total agent count', () => {
    const agents = [
      createAgent({ state: 'running' }),
      createAgent({ state: 'blocked' }),
      createAgent({ state: 'failed' }),
    ];
    const snapshot = createSystemSnapshot({ agents });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('total-agents').textContent).toBe('3');
  });

  it('displays active agent count (running + resuming)', () => {
    const agents = [
      createAgent({ state: 'running' }),
      createAgent({ state: 'resuming' }),
      createAgent({ state: 'blocked' }),
    ];
    const snapshot = createSystemSnapshot({ agents });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('active-agents').textContent).toBe('2');
  });

  it('displays blocked agent count', () => {
    const agents = [
      createAgent({ state: 'blocked' }),
      createAgent({ state: 'waiting_pfc' }),
      createAgent({ state: 'running' }),
    ];
    const snapshot = createSystemSnapshot({ agents });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('blocked-agents').textContent).toBe('2');
  });

  it('displays failed agent count', () => {
    const agents = [
      createAgent({ state: 'failed' }),
      createAgent({ state: 'failed' }),
      createAgent({ state: 'running' }),
    ];
    const snapshot = createSystemSnapshot({ agents });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('failed-agents').textContent).toBe('2');
  });

  it('displays project count from projectControls', () => {
    const snapshot = createSystemSnapshot({
      projectControls: {
        ['proj-1' as ProjectId]: {} as any,
        ['proj-2' as ProjectId]: {} as any,
        ['proj-3' as ProjectId]: {} as any,
      },
    });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('project-count').textContent).toBe('3');
  });

  it('displays snapshot freshness', () => {
    const snapshot = createSystemSnapshot({
      generatedAt: new Date().toISOString(),
    });

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    const freshness = screen.getByTestId('snapshot-freshness');
    expect(freshness).toBeTruthy();
    // Should show "just now" or similar for a just-generated snapshot
    expect(freshness.textContent).toBeTruthy();
  });

  it('renders the strip container with data-testid', () => {
    const snapshot = createSystemSnapshot();

    render(<MaoSystemHealthStrip snapshot={snapshot} />);

    expect(screen.getByTestId('system-health-strip')).toBeTruthy();
  });
});
