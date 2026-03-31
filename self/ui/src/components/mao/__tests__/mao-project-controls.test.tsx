// @vitest-environment jsdom

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MaoProjectControls } from '../mao-project-controls';
import type { MaoProjectSnapshot } from '@nous/shared';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createSnapshot(): MaoProjectSnapshot {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    densityMode: 'D2',
    workflowRunId: '22222222-2222-2222-2222-222222222222',
    controlProjection: {
      project_id: '11111111-1111-1111-1111-111111111111',
      project_control_state: 'running',
      active_agent_count: 1,
      blocked_agent_count: 0,
      urgent_agent_count: 0,
      pfc_project_review_status: 'none',
      pfc_project_recommendation: 'continue',
      resume_readiness_status: 'not_applicable',
      resume_readiness_evidence_refs: [],
    },
    grid: [],
    graph: { projectId: '11111111-1111-1111-1111-111111111111', nodes: [], edges: [], generatedAt: '2026-03-10T01:00:00.000Z' },
    urgentOverlay: { urgentAgentIds: [], blockedAgentIds: [], generatedAt: '2026-03-10T01:00:00.000Z' },
    summary: {
      activeAgentCount: 1,
      blockedAgentCount: 0,
      failedAgentCount: 0,
      waitingPfcAgentCount: 0,
      urgentAgentCount: 0,
    },
    diagnostics: { runtimePosture: 'single_process_local' },
    generatedAt: '2026-03-10T01:00:00.000Z',
  } as unknown as MaoProjectSnapshot;
}

describe('MaoProjectControls', () => {
  it('generates a unique commandId on each button click', () => {
    const onRequestControl = vi.fn();

    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={onRequestControl}
      />,
    );

    // Fill in the reason (required to enable buttons)
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Test reason' } });

    // Click the "Hard Stop Project" button (always enabled when running)
    const hardStopButton = screen.getByText('Hard Stop Project');
    fireEvent.click(hardStopButton);
    fireEvent.click(hardStopButton);

    expect(onRequestControl).toHaveBeenCalledTimes(2);

    const firstCommandId = onRequestControl.mock.calls[0][0].commandId;
    const secondCommandId = onRequestControl.mock.calls[1][0].commandId;

    // Both should be valid UUIDs
    expect(firstCommandId).toMatch(UUID_REGEX);
    expect(secondCommandId).toMatch(UUID_REGEX);

    // They should be different (not static)
    expect(firstCommandId).not.toBe(secondCommandId);
  });

  it('generates different commandIds for different button types', () => {
    const onRequestControl = vi.fn();

    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={onRequestControl}
      />,
    );

    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Test reason' } });

    // Click Pause then Hard Stop
    const pauseButton = screen.getByText('Pause Project');
    fireEvent.click(pauseButton);

    const hardStopButton = screen.getByText('Hard Stop Project');
    fireEvent.click(hardStopButton);

    expect(onRequestControl).toHaveBeenCalledTimes(2);

    const pauseCommandId = onRequestControl.mock.calls[0][0].commandId;
    const hardStopCommandId = onRequestControl.mock.calls[1][0].commandId;

    expect(pauseCommandId).toMatch(UUID_REGEX);
    expect(hardStopCommandId).toMatch(UUID_REGEX);
    expect(pauseCommandId).not.toBe(hardStopCommandId);
  });

  it('passes the correct action to onRequestControl', () => {
    const onRequestControl = vi.fn();

    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={onRequestControl}
      />,
    );

    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Test reason' } });

    const pauseButton = screen.getByText('Pause Project');
    fireEvent.click(pauseButton);

    expect(onRequestControl).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pause_project',
        reason: 'Test reason',
        commandId: expect.stringMatching(UUID_REGEX),
      }),
    );
  });
});
