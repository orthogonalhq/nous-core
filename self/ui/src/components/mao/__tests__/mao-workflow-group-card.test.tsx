// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentProjection } from '@nous/shared';
import {
  MaoWorkflowGroupCard,
  resolveAgentLabel,
} from '../mao-workflow-group-card';

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

const noop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('resolveAgentLabel', () => {
  it('prefers display_name over other fields', () => {
    const agent = createAgent({
      display_name: 'My Agent',
      current_step: 'Step 1',
      agent_class: 'Worker' as any,
    });
    expect(resolveAgentLabel(agent)).toBe('My Agent');
  });

  it('falls back to current_step when display_name is undefined', () => {
    const agent = createAgent({ current_step: 'Process Data' });
    expect(resolveAgentLabel(agent)).toBe('Process Data');
  });

  it('falls back to agent_class label when display_name and current_step are unavailable', () => {
    const agent = createAgent({
      display_name: undefined,
      current_step: undefined as any,
      agent_class: 'Orchestrator' as any,
    });
    expect(resolveAgentLabel(agent)).toBe('Orchestrator');
  });

  it('falls back to "Agent" when everything is undefined', () => {
    const agent = createAgent({
      display_name: undefined,
      current_step: undefined as any,
      agent_class: undefined,
    });
    expect(resolveAgentLabel(agent)).toBe('Agent');
  });
});

describe('MaoWorkflowGroupCard', () => {
  it('renders orchestrator in card header and workers below', () => {
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orchestrator' });
    const w1 = createAgent({ agent_id: 'w1', display_name: 'Worker 1' });
    const w2 = createAgent({ agent_id: 'w2', display_name: 'Worker 2' });

    render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[w1, w2]}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('workflow-group-card')).toBeTruthy();
    expect(screen.getByText('Orchestrator')).toBeTruthy();
    expect(screen.getByText('Worker 1')).toBeTruthy();
    expect(screen.getByText('Worker 2')).toBeTruthy();
  });

  it('fires onSelectAgent when orchestrator tile is clicked', () => {
    const handler = vi.fn();
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orch' });

    render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[]}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={handler}
      />,
    );

    fireEvent.click(screen.getByText('Orch'));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'orch-1' }),
    );
  });

  it('fires onSelectAgent when a worker tile is clicked', () => {
    const handler = vi.fn();
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orch' });
    const worker = createAgent({ agent_id: 'w1', display_name: 'Worker 1' });

    render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[worker]}
        densityMode="D2"
        selectedAgentId={null}
        onSelectAgent={handler}
      />,
    );

    fireEvent.click(screen.getByText('Worker 1'));
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'w1' }),
    );
  });

  it('renders D4 compact blocks with count badge', () => {
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orch' });
    const w1 = createAgent({ agent_id: 'w1' });
    const w2 = createAgent({ agent_id: 'w2' });

    render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[w1, w2]}
        densityMode="D4"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('workflow-group-card')).toBeTruthy();
    // Count badge: 3 agents total (orch + 2 workers)
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders D3 compact micro tiles', () => {
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orch' });
    const w1 = createAgent({ agent_id: 'w1', display_name: 'W1' });

    render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[w1]}
        densityMode="D3"
        selectedAgentId={null}
        onSelectAgent={noop}
      />,
    );

    expect(screen.getByTestId('workflow-group-card')).toBeTruthy();
  });

  it('highlights selected agent', () => {
    const orch = createAgent({ agent_id: 'orch-1', display_name: 'Orch' });

    const { container } = render(
      <MaoWorkflowGroupCard
        orchestrator={orch}
        workers={[]}
        densityMode="D2"
        selectedAgentId="orch-1"
        onSelectAgent={noop}
      />,
    );

    const selectedButton = container.querySelector('[data-agent-id="orch-1"]');
    expect(selectedButton?.className).toContain('border-primary');
  });
});
