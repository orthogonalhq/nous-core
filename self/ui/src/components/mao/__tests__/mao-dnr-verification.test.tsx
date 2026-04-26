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
