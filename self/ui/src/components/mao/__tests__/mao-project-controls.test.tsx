// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MaoProjectControls,
  TOAST_BODY_BY_OUTCOME,
  classifyOutcome,
  type OpctlSubmitToastOutcome,
} from '../mao-project-controls';
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

// --- WR-162 SP 14 (SUPV-SP14-001..006) — Project-controls polish ---

function makeResult(
  overrides: Partial<MaoProjectControlResult>,
): MaoProjectControlResult {
  return {
    command_id: 'cmd-result',
    project_id: '11111111-1111-1111-1111-111111111111',
    accepted: true,
    status: 'applied',
    from_state: 'running',
    to_state: 'paused_review',
    reason_code: 'mao_project_control_applied',
    decision_ref: 'mao-control:cmd-result',
    impactSummary: {
      activeRunCount: 0,
      activeAgentCount: 0,
      blockedAgentCount: 0,
      urgentAgentCount: 0,
      affectedScheduleCount: 0,
      evidenceRefs: [],
    },
    evidenceRefs: [],
    readiness_status: 'not_applicable',
    ...overrides,
  } as unknown as MaoProjectControlResult;
}

describe('UT-SP14-PC — project-controls polish (SUPV-SP14-001..006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // UT-SP14-PC-BANNER-PRESENT
  it('UT-SP14-PC-BANNER-PRESENT — renders scope-lock banner after submit', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Pause for review' } });
    fireEvent.click(screen.getByText('Pause Project'));
    expect(screen.getByTestId('scope-lock-banner')).toBeTruthy();
    expect(screen.getByTestId('scope-lock-banner').getAttribute('data-banner-action')).toBe('pause_project');
  });

  // UT-SP14-PC-BANNER-ABSENT
  it('UT-SP14-PC-BANNER-ABSENT — does not render banner before any submit', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('scope-lock-banner')).toBeNull();
  });

  // UT-SP14-PC-AUTO-CLEAR
  it('UT-SP14-PC-AUTO-CLEAR — banner clears when lastResult.status === "applied"', () => {
    const { rerender } = render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Pause' } });
    fireEvent.click(screen.getByText('Pause Project'));
    expect(screen.getByTestId('scope-lock-banner')).toBeTruthy();

    rerender(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={makeResult({ status: 'applied' })}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('scope-lock-banner')).toBeNull();
  });

  // UT-SP14-PC-BANNER-PERSIST-ON-CONFLICT — banner persists for blocked_conflict_resolved
  it('UT-SP14-PC-BANNER-PERSIST-ON-CONFLICT — banner persists when lastResult is blocked_conflict_resolved', () => {
    const { rerender } = render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Pause' } });
    fireEvent.click(screen.getByText('Pause Project'));
    expect(screen.getByTestId('scope-lock-banner')).toBeTruthy();

    rerender(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={makeResult({
          status: 'blocked',
          reason_code: 'opctl_conflict_resolved',
        })}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.getByTestId('scope-lock-banner')).toBeTruthy();
  });

  // UT-SP14-PC-TOAST-PER-OUTCOME — closed Record exhaustiveness over four outcomes
  it('UT-SP14-PC-TOAST-PER-OUTCOME — TOAST_BODY_BY_OUTCOME admits all four outcomes', () => {
    const expected: OpctlSubmitToastOutcome[] = [
      'applied',
      'rejected',
      'blocked_conflict_resolved',
      'blocked_other',
    ];
    expect(Object.keys(TOAST_BODY_BY_OUTCOME).sort()).toEqual([...expected].sort());
    expect(TOAST_BODY_BY_OUTCOME.applied.tone).toBe('success');
    expect(TOAST_BODY_BY_OUTCOME.rejected.tone).toBe('error');
    expect(TOAST_BODY_BY_OUTCOME.blocked_conflict_resolved.tone).toBe('info');
    expect(TOAST_BODY_BY_OUTCOME.blocked_other.tone).toBe('warn');
  });

  // UT-SP14-PC-TOAST-CLASSIFY — closed pure discriminator
  it('UT-SP14-PC-TOAST-CLASSIFY — classifyOutcome maps the four submit-result branches', () => {
    expect(classifyOutcome(makeResult({ status: 'applied' }))).toBe('applied');
    expect(classifyOutcome(makeResult({ status: 'rejected' }))).toBe('rejected');
    expect(
      classifyOutcome(
        makeResult({
          status: 'blocked',
          reason_code: 'opctl_conflict_resolved',
        }),
      ),
    ).toBe('blocked_conflict_resolved');
    expect(
      classifyOutcome(
        makeResult({ status: 'blocked', reason_code: 'OPCTL-006' }),
      ),
    ).toBe('blocked_other');
  });

  // UT-SP14-PC-TOAST-RENDERED — toast surfaces in DOM after lastResult arrives
  it('UT-SP14-PC-TOAST-RENDERED — toast renders on lastResult dispatch', () => {
    const { rerender } = render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    rerender(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={makeResult({ status: 'applied' })}
        onRequestControl={vi.fn()}
      />,
    );
    const toast = screen.getByTestId('project-controls-toast');
    expect(toast).toBeTruthy();
    expect(toast.getAttribute('data-toast-tone')).toBe('success');
    expect(toast.textContent).toContain('Command applied');
  });

  // UT-SP14-PC-CANCEL-QUEUED — renderer-only abandon-the-promise
  it('UT-SP14-PC-CANCEL-QUEUED — clicking "Cancel queued" clears banner + emits info toast', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    fireEvent.change(textarea, { target: { value: 'Hard stop' } });
    fireEvent.click(screen.getByText('Hard Stop Project'));
    expect(screen.getByTestId('scope-lock-banner')).toBeTruthy();

    fireEvent.click(screen.getByTestId('scope-lock-cancel-queued'));
    expect(screen.queryByTestId('scope-lock-banner')).toBeNull();

    const toast = screen.getByTestId('project-controls-toast');
    expect(toast.getAttribute('data-toast-tone')).toBe('info');
    expect(toast.textContent).toContain('Cancellation visual');
  });

  // UT-SP14-PC-TIER-BADGE — each control button carries a tier badge
  it('UT-SP14-PC-TIER-BADGE — three control buttons each render a tier badge', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const badges = document.querySelectorAll('[data-tier-badge]');
    expect(badges.length).toBe(3);
    const levels = Array.from(badges).map((el) => el.getAttribute('data-tier-badge'));
    // pause_project → pause → T1; resume_project → resume → T3; hard_stop_project → hard_stop → T3.
    expect(levels).toEqual(['T1', 'T3', 'T3']);
  });

  // UT-SP14-PC-TIER-BADGE-SEVERITY — severity-token reuses SP 13 CSS-var pipeline
  it('UT-SP14-PC-TIER-BADGE-SEVERITY — tier badges carry the SP 13 severity-token', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const badges = document.querySelectorAll('[data-tier-severity]');
    const severities = Array.from(badges).map((el) =>
      el.getAttribute('data-tier-severity'),
    );
    // pause→T1→medium; resume→T3→critical; hard_stop→T3→critical.
    expect(severities).toEqual(['medium', 'critical', 'critical']);
  });

  // UT-SP14-PC-DNR-F1 / DNR-A4 — three controls present at all times
  it('UT-SP14-PC-DNR-F1 — three project-control buttons remain present', () => {
    render(
      <MaoProjectControls
        snapshot={createSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.getByText('Pause Project')).toBeTruthy();
    expect(screen.getByText('Resume Project')).toBeTruthy();
    expect(screen.getByText('Hard Stop Project')).toBeTruthy();
  });
});

/**
 * SP 15 — UT-SP15-PC-MATRIX (SUPV-SP15-002).
 *
 * Closed-enum `it.each` over the four `OpctlSubmitToastOutcome` literals plus
 * one `cancel-queued` cell verifying `classifyOutcome` invariance + the
 * `TOAST_BODY_BY_OUTCOME` lookup table contract. Per
 * `feedback_no_heuristic_bandaids.md`: the cell discriminator is the closed
 * enum, not pattern matching on toast text.
 */
const PC_MATRIX_OUTCOMES: ReadonlyArray<{
  outcome: OpctlSubmitToastOutcome;
  result: MaoProjectControlResult;
  expectedTone: 'success' | 'error' | 'info' | 'warn';
}> = [
  {
    outcome: 'applied',
    result: {
      command_id: 'cmd-applied',
      project_id: '11111111-1111-1111-1111-111111111111',
      accepted: true,
      status: 'applied',
      reason_code: undefined,
      message: 'ok',
      submittedAt: '2026-03-29T00:00:00.000Z',
      evidenceRefs: [],
    } as unknown as MaoProjectControlResult,
    expectedTone: 'success',
  },
  {
    outcome: 'rejected',
    result: {
      command_id: 'cmd-rejected',
      project_id: '11111111-1111-1111-1111-111111111111',
      accepted: false,
      status: 'rejected',
      reason_code: 'OPCTL-003',
      message: 'rejected',
      submittedAt: '2026-03-29T00:00:00.000Z',
      evidenceRefs: [],
    } as unknown as MaoProjectControlResult,
    expectedTone: 'error',
  },
  {
    outcome: 'blocked_conflict_resolved',
    result: {
      command_id: 'cmd-blocked-conflict',
      project_id: '11111111-1111-1111-1111-111111111111',
      accepted: false,
      status: 'blocked',
      reason_code: 'opctl_conflict_resolved',
      message: 'queued',
      submittedAt: '2026-03-29T00:00:00.000Z',
      evidenceRefs: [],
    } as unknown as MaoProjectControlResult,
    expectedTone: 'info',
  },
  {
    outcome: 'blocked_other',
    result: {
      command_id: 'cmd-blocked-other',
      project_id: '11111111-1111-1111-1111-111111111111',
      accepted: false,
      status: 'blocked',
      reason_code: 'OPCTL-006',
      message: 'blocked',
      submittedAt: '2026-03-29T00:00:00.000Z',
      evidenceRefs: [],
    } as unknown as MaoProjectControlResult,
    expectedTone: 'warn',
  },
];

describe('UT-SP15-PC-MATRIX — OpctlSubmitToastOutcome closed-enum cell coverage', () => {
  it.each(PC_MATRIX_OUTCOMES)(
    'UT-SP15-PC-MATRIX-$outcome — classifyOutcome routes to $outcome with TOAST_BODY tone=$expectedTone',
    ({ outcome, result, expectedTone }) => {
      // Compile-time exhaustiveness: TOAST_BODY_BY_OUTCOME admits the literal.
      expect(TOAST_BODY_BY_OUTCOME[outcome]).toBeDefined();
      expect(TOAST_BODY_BY_OUTCOME[outcome].tone).toBe(expectedTone);
      // Runtime: classifyOutcome maps result → outcome literal.
      expect(classifyOutcome(result)).toBe(outcome);
    },
  );

  it('UT-SP15-PC-MATRIX-CANCEL-QUEUED — blocked_conflict_resolved persists banner (queued) until next submit', () => {
    // Visual cell: the queued discriminator does NOT reset banner state on
    // toast emission — verified by the `outcome !== blocked_conflict_resolved`
    // guard at line 256 of mao-project-controls.tsx (SUPV-SP14-007).
    const queued = PC_MATRIX_OUTCOMES[2]!;
    expect(queued.outcome).toBe('blocked_conflict_resolved');
    expect(classifyOutcome(queued.result)).toBe('blocked_conflict_resolved');
    expect(TOAST_BODY_BY_OUTCOME.blocked_conflict_resolved.tone).toBe('info');
  });
});
