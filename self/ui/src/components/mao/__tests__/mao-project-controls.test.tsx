// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaoProjectControls } from '../mao-project-controls';
import type { MaoProjectControlResult, MaoProjectSnapshot } from '@nous/shared';

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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('MaoProjectControls Cortex and evidence surfaces', () => {
  it('renders Cortex review status in body', () => {
    const snapshot = createSnapshot();
    (snapshot.controlProjection as any).pfc_project_review_status = 'active';

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );

    const section = screen.getByTestId('cortex-review-section');
    expect(section).toBeTruthy();
    expect(section.textContent).toContain('active');
  });

  it('shows "No active Cortex review" when pfc_project_review_status is "none"', () => {
    const snapshot = createSnapshot();

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );

    const section = screen.getByTestId('cortex-review-section');
    expect(section.textContent).toContain('No active Cortex review');
  });

  it('renders clickable evidence links from resume_readiness_evidence_refs', () => {
    const snapshot = createSnapshot();
    (snapshot.controlProjection as any).resume_readiness_evidence_refs = [
      'evidence://ref-1',
      'evidence://ref-2',
    ];

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );

    const section = screen.getByTestId('resume-readiness-evidence');
    expect(section).toBeTruthy();

    const links = section.querySelectorAll('[data-evidence-ref]');
    expect(links.length).toBe(2);
    expect(links[0]!.getAttribute('data-evidence-ref')).toBe('evidence://ref-1');
    expect(links[1]!.getAttribute('data-evidence-ref')).toBe('evidence://ref-2');
  });

  it('renders clickable evidence links from lastResult.evidenceRefs', () => {
    const snapshot = createSnapshot();
    const lastResult: MaoProjectControlResult = {
      command_id: 'cmd-001',
      project_id: '11111111-1111-1111-1111-111111111111',
      accepted: true,
      status: 'applied',
      from_state: 'paused_review',
      to_state: 'running',
      reason_code: 'mao_project_control_applied',
      decision_ref: 'mao-control:cmd-001',
      impactSummary: {
        activeRunCount: 1,
        activeAgentCount: 1,
        blockedAgentCount: 0,
        urgentAgentCount: 0,
        affectedScheduleCount: 0,
        evidenceRefs: [],
      },
      evidenceRefs: ['evidence://result-ref-1'],
      readiness_status: 'passed',
    } as unknown as MaoProjectControlResult;

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={lastResult}
        onRequestControl={vi.fn()}
      />,
    );

    const section = screen.getByTestId('last-result-evidence');
    expect(section).toBeTruthy();

    const links = section.querySelectorAll('[data-evidence-ref]');
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute('data-evidence-ref')).toBe('evidence://result-ref-1');
  });

  it('renders no evidence section when evidence refs are empty', () => {
    const snapshot = createSnapshot();

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('resume-readiness-evidence')).toBeNull();
  });

  it('START-005 placeholder element is present', () => {
    const snapshot = createSnapshot();

    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );

    expect(screen.getByTestId('start-005-stub')).toBeTruthy();
  });
});

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
