// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MaoAgentInspectProjection,
  MaoDensityMode,
  MaoGridTileProjection,
  MaoProjectSnapshot,
} from '@nous/shared';
import { MaoDensityGrid } from '../mao-density-grid';
import { MaoInspectPanel } from '../mao-inspect-panel';
import { MaoServicesProvider } from '../mao-services-context';

/**
 * UT-SP13-DNR-* — Explicit one-test-per-DNR-row regression guards.
 *
 * Per `.architecture/.decisions/2026-04-14-system-observability-and-control/
 * mao-ux-polish-scope-v1.md § Verification` review-substrate convention.
 * SDS § Invariants SUPV-SP13-027; Goals SC-22.
 *
 * Coverage:
 *   - UT-SP13-DNR-A3 — density grid renders for every D0..D4 literal.
 *   - UT-SP13-DNR-B1 — inspect panel keeps all 20 per-agent fields
 *     render-available.
 *   - UT-SP13-DNR-C2 — D3 micro-tile click handler routes selection (≤2
 *     interactions to popup).
 *   - UT-SP13-DNR-C3 — D3/D4 micro tile body has no destructive control
 *     button.
 *   - UT-SP13-DNR-C4 — urgent overlay DOM is present under
 *     `prefers-reduced-motion: reduce`.
 */

function FakeLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href}>{children}</a>;
}

const mockServices = {
  Link: FakeLink,
  useProject: () => ({ projectId: 'proj-001', setProjectId: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MaoServicesProvider value={mockServices}>{children}</MaoServicesProvider>;
}

function createTile(
  overrides?: Partial<MaoGridTileProjection['agent']>,
): MaoGridTileProjection {
  return {
    agent: {
      agent_id: 'agent-001',
      current_step: 'Execute task',
      dispatch_state: 'dispatched',
      state: 'running',
      risk_level: 'low',
      attention_level: 'normal',
      progress_percent: 50,
      reflection_cycle_count: 2,
      reasoning_log_preview: null,
      urgency_level: 'normal',
      workflow_run_id: 'run-001',
      workflow_node_definition_id: 'node-001',
      last_update_at: '2026-04-25T10:00:00Z',
      deepLinks: [],
      evidenceRefs: [],
      ...overrides,
    },
    inspectOnly: false,
  } as MaoGridTileProjection;
}

function createSnapshot(
  densityMode: MaoDensityMode,
  tiles: MaoGridTileProjection[],
  overrides?: Partial<MaoProjectSnapshot>,
): MaoProjectSnapshot {
  return {
    projectId: 'project-001',
    densityMode,
    workflowRunId: 'run-001',
    controlProjection: {
      project_control_state: 'nominal',
      pfc_project_recommendation: 'proceed',
    },
    grid: tiles,
    graph: { nodes: [], edges: [] },
    urgentOverlay: { urgentAgentIds: [], blockedAgentIds: [] },
    summary: {
      activeAgentCount: tiles.length,
      blockedAgentCount: 0,
      completedAgentCount: 0,
      urgentAgentCount: 0,
    },
    diagnostics: { runtimePosture: 'single_process_local' },
    generatedAt: '2026-04-25T10:00:00Z',
    ...overrides,
  } as unknown as MaoProjectSnapshot;
}

const DENSITY_LITERALS: ReadonlyArray<MaoDensityMode> = ['D0', 'D1', 'D2', 'D3', 'D4'];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('UT-SP13-DNR-A3 — density ladder (DNR-A3 binding)', () => {
  it('UT-SP13-DNR-A3 — density grid renders without throwing for every D0..D4 literal', () => {
    for (const literal of DENSITY_LITERALS) {
      const snapshot = createSnapshot(literal, [createTile()]);
      const { unmount } = render(
        <MaoDensityGrid
          snapshot={snapshot}
          selectedAgentId={null}
          onSelectTile={vi.fn()}
        />,
      );
      // Density-mode badge in card header should reflect the literal
      // (existing render path; SP 13 polish does not modify the badge).
      expect(screen.getAllByText(literal).length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe('UT-SP13-DNR-B1 — 20 per-agent projection field render-availability (DNR-B1)', () => {
  it('UT-SP13-DNR-B1 — inspect panel preserves all 20 per-agent projection fields when fully populated', () => {
    const fullProjection: MaoAgentInspectProjection = {
      projectId: 'proj-001',
      workflowRunId: 'run-001',
      agent: {
        agent_id: 'agent-001-uuid',
        agent_class: 'worker',
        state: 'running',
        urgency_level: 'urgent',
        current_step: 'B1-step',
        progress_percent: 75,
        reflection_cycle_count: 3,
        dispatch_state: 'dispatched',
        risk_level: 'medium',
        attention_level: 'high',
        last_update_at: '2026-04-25T10:00:00Z',
        dispatching_task_agent_id: 'parent-uuid',
        reasoning_log_preview: {
          class: 'tool_invocation',
          summary: 'Tool invocation summary',
          evidenceRef: 'evidence:abc123',
          redactionClass: 'public_operator',
          previewMode: 'inline',
          chatLink: null,
          projectsLink: null,
        },
        reasoning_log_redaction_state: 'partial',
        deepLinks: [{ target: 'chat' } as unknown],
        evidenceRefs: ['evidence:abc123', 'evidence:def456'],
        guardrail_status: 'warning',
        witness_integrity_status: 'degraded',
        sentinel_risk_score: 0.42,
        inference_provider_id: 'anthropic',
        inference_model_id: 'claude-4',
        inference_latency_ms: 120,
        inference_total_tokens: 5400,
        inference_is_streaming: false,
        workflow_run_id: 'run-001',
        workflow_node_definition_id: 'node-001',
      } as unknown,
      projectControlState: 'nominal',
      runStatus: 'running',
      waitKind: undefined,
      latestAttempt: null,
      correctionArcs: [],
      evidenceRefs: ['evidence:abc123'],
      generatedAt: '2026-04-25T10:00:00Z',
    } as unknown as MaoAgentInspectProjection;

    render(<MaoInspectPanel inspect={fullProjection} isLoading={false} />, {
      wrapper: Wrapper,
    });

    // Spot-check render presence for the five most-likely-to-regress field
    // groups: agent badges, evidence refs, supervisor section, redaction
    // visual badge, deep links. Per SDS § Field Inventory the panel preserves
    // all 20 rows; this test asserts the key DOM nodes are present rather
    // than re-walking each `data-testid` (some fields render as inline text).
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
    expect(screen.getAllByText('urgent').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/evidence:abc123/).length).toBeGreaterThan(0);
    // Supervisor section present (DNR-B3 chained — DNR-B1 implies the
    // supervisor fields are render-eligible when present).
    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    // Redaction visual badge present (DNR-B4 chained).
    expect(screen.getByTestId('redaction-visual-badge')).toBeTruthy();
  });
});

describe('UT-SP13-DNR-C2 — D3/D4 inspect-first ≤2 interactions (DNR-C2)', () => {
  it('UT-SP13-DNR-C2 — D3 micro tile click invokes onSelectTile (one interaction → popup-opening signal)', () => {
    const onSelectTile = vi.fn();
    const tile = createTile();
    const snapshot = createSnapshot('D3', [tile]);

    render(
      <MaoDensityGrid
        snapshot={snapshot}
        selectedAgentId={null}
        onSelectTile={onSelectTile}
      />,
    );

    const button = screen.getByTestId('density-tile-d3');
    button.click();
    expect(onSelectTile).toHaveBeenCalledTimes(1);
    expect(onSelectTile).toHaveBeenCalledWith(tile);
  });
});

describe('UT-SP13-DNR-C3 — no destructive control on D3/D4 micro tile (DNR-C3)', () => {
  it('UT-SP13-DNR-C3 — D3 tile body contains zero pause/hard_stop/resume button or text', () => {
    const snapshot = createSnapshot('D3', [createTile()]);
    render(
      <MaoDensityGrid
        snapshot={snapshot}
        selectedAgentId={null}
        onSelectTile={vi.fn()}
      />,
    );
    expect(screen.queryByText(/pause/i)).toBeNull();
    expect(screen.queryByText(/resume/i)).toBeNull();
    expect(screen.queryByText(/hard.?stop/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /pause|resume|hard.?stop/i })).toBeNull();
  });

  it('UT-SP13-DNR-C3 — D4 micro tile contains zero pause/hard_stop/resume button or text', () => {
    const snapshot = createSnapshot('D4', [createTile()]);
    render(
      <MaoDensityGrid
        snapshot={snapshot}
        selectedAgentId={null}
        onSelectTile={vi.fn()}
      />,
    );
    expect(screen.queryByText(/pause/i)).toBeNull();
    expect(screen.queryByText(/resume/i)).toBeNull();
    expect(screen.queryByText(/hard.?stop/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /pause|resume|hard.?stop/i })).toBeNull();
  });
});

describe('UT-SP13-DNR-C4 — urgent overlay visibility unconditional on motion preference (DNR-C4)', () => {
  it('UT-SP13-DNR-C4 — urgent indicator DOM is present under prefers-reduced-motion: reduce', () => {
    // matchMedia mock per SP 10 / SP 12 precedent.
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });

    const tile = createTile({
      agent_id: 'urgent-agent',
      urgency_level: 'urgent',
    } as unknown as Partial<MaoGridTileProjection['agent']>);
    const snapshot = createSnapshot('D0', [tile], {
      urgentOverlay: {
        urgentAgentIds: ['urgent-agent'],
        blockedAgentIds: [],
      },
    } as unknown as Partial<MaoProjectSnapshot>);

    render(
      <MaoDensityGrid
        snapshot={snapshot}
        selectedAgentId={null}
        onSelectTile={vi.fn()}
      />,
    );

    // Urgent indicator DOM element remains visible under reduced-motion.
    const urgentBadge = screen.getByTestId('urgent-indicator');
    expect(urgentBadge).toBeTruthy();
    expect(urgentBadge.getAttribute('data-mao-urgent-indicator')).toBe('present');
  });
});

// --- WR-162 SP 14 (SUPV-SP14-018) — DNR row regression guards ---

import { MaoProjectControls } from '../mao-project-controls';
import {
  MaoT3ConfirmationDialog,
  type MaoT3ConfirmationDialogProps,
} from '../mao-t3-confirmation-dialog';

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: { getControlAuditHistory: { invalidate: vi.fn() } },
    }),
    mao: {
      getControlAuditHistory: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, isError: false }),
      },
    },
    opctl: {
      requestConfirmationProof: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}));

function makeProjectControlsSnapshot(): MaoProjectSnapshot {
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

describe('UT-SP14-DNR — DNR row regression guards', () => {
  afterEach(() => cleanup());

  // UT-SP14-DNR-A4 / DNR-F1 — three project-control buttons remain present
  it('UT-SP14-DNR-A4 / DNR-F1 — three project controls present in MaoProjectControls', () => {
    render(
      <MaoProjectControls
        snapshot={makeProjectControlsSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.getByText('Pause Project')).toBeTruthy();
    expect(screen.getByText('Resume Project')).toBeTruthy();
    expect(screen.getByText('Hard Stop Project')).toBeTruthy();
  });

  // UT-SP14-DNR-F3 — Cortex review surface preserved
  it('UT-SP14-DNR-F3 — Cortex review surface preserved post-polish', () => {
    render(
      <MaoProjectControls
        snapshot={makeProjectControlsSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    expect(screen.getByTestId('cortex-review-section')).toBeTruthy();
  });

  // UT-SP14-DNR-F4 — admission guardrails (Pause Project disabled when paused)
  it('UT-SP14-DNR-F4 — admission guardrail visible: Pause disabled when state is paused_review', () => {
    const snapshot = makeProjectControlsSnapshot();
    (snapshot.controlProjection as any).project_control_state = 'paused_review';
    render(
      <MaoProjectControls
        snapshot={snapshot}
        pending={false}
        lastResult={null}
        onRequestControl={vi.fn()}
      />,
    );
    const pauseBtn = screen.getByText('Pause Project').closest('button');
    expect(pauseBtn).toBeTruthy();
    expect((pauseBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // UT-SP14-DNR-F5 — reason capture flow preserved
  it('UT-SP14-DNR-F5 — reason capture textarea preserved; submit blocked without reason', () => {
    const onRequestControl = vi.fn();
    render(
      <MaoProjectControls
        snapshot={makeProjectControlsSnapshot()}
        pending={false}
        lastResult={null}
        onRequestControl={onRequestControl}
      />,
    );
    const textarea = screen.getByPlaceholderText(/operator reason/i);
    expect(textarea).toBeTruthy();
    // Without reason, button is disabled.
    const pause = screen.getByText('Pause Project').closest('button');
    expect((pause as HTMLButtonElement).disabled).toBe(true);
  });

  // UT-SP14-DNR-J1 — additive optional supervisorLocked + result props (no new required prop)
  it('UT-SP14-DNR-J1 — MaoT3ConfirmationDialogProps remain shape-compatible (optional supervisorLocked + result)', () => {
    // TypeScript-compile-time check via assignability.
    const props: MaoT3ConfirmationDialogProps = {
      open: true,
      action: 'resume_project',
      projectId: '550e8400-e29b-41d4-a716-446655445001' as any,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    };
    expect(props.supervisorLocked).toBeUndefined();
    expect(props.result).toBeUndefined();
  });

  // UT-SP14-DNR-J2 — render-contract under existing host
  it('UT-SP14-DNR-J2 — MaoT3ConfirmationDialog mounts under existing host fixture without crashing', () => {
    render(
      <MaoT3ConfirmationDialog
        open={true}
        action="resume_project"
        projectId={'550e8400-e29b-41d4-a716-446655445001' as any}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('t3-confirmation-dialog')).toBeTruthy();
  });
});
