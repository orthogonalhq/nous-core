// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentInspectProjection } from '@nous/shared';
import { MaoInspectPanel } from '../mao-inspect-panel';
import { MaoServicesProvider } from '../mao-services-context';

/**
 * UT-SP13-SUP-* — Supervisor section conditional rendering.
 *
 * Per SDS § Invariants SUPV-SP13-017 + SUPV-SP13-018; Goals SC-12 + SC-13 +
 * SC-39. HF-019 dispatch-packet binding: "render `null` when no data is
 * present — do not stub with placeholder data."
 *
 * Coverage:
 *   - UT-SP13-SUP-PRESENT-ALL — chip+row trio when all three fields present.
 *   - UT-SP13-SUP-PRESENT-GUARDRAIL-ONLY — only guardrail chip rendered.
 *   - UT-SP13-SUP-PRESENT-WITNESS-ONLY — only witness chip rendered.
 *   - UT-SP13-SUP-PRESENT-SENTINEL-ONLY — only sentinel chip (band-mapped).
 *   - UT-SP13-SUP-MIXED — guardrail + sentinel, witness absent.
 *   - UT-SP13-SUP-ABSENT-NO-PLACEHOLDER — all three absent; structural
 *     `queryByTestId('mao-supervisor-section') === null` + four
 *     `queryByText === null` placeholder absence assertions.
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

function createInspect(
  agentOverrides?: Partial<Record<string, unknown>>,
): MaoAgentInspectProjection {
  return {
    projectId: 'proj-001',
    workflowRunId: 'run-001',
    agent: {
      agent_id: 'agent-001',
      current_step: 'Process data',
      dispatch_state: 'dispatched',
      state: 'running',
      risk_level: 'low',
      attention_level: 'normal',
      progress_percent: 50,
      reflection_cycle_count: 0,
      reasoning_log_preview: null,
      reasoning_log_redaction_state: 'none',
      urgency_level: 'normal',
      workflow_run_id: 'run-001',
      workflow_node_definition_id: 'node-001',
      deepLinks: [],
      evidenceRefs: [],
      ...agentOverrides,
    },
    projectControlState: 'nominal',
    runStatus: 'running',
    waitKind: undefined,
    latestAttempt: null,
    correctionArcs: [],
    evidenceRefs: [],
    generatedAt: '2026-04-25T00:00:00Z',
  } as unknown as MaoAgentInspectProjection;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('UT-SP13-SUP — supervisor section conditional rendering', () => {
  it('UT-SP13-SUP-PRESENT-ALL — renders chip trio when all three fields present', () => {
    const inspect = createInspect({
      guardrail_status: 'warning',
      witness_integrity_status: 'degraded',
      sentinel_risk_score: 0.62,
    });

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    expect(screen.getByText(/Guardrail: warning/i)).toBeTruthy();
    expect(screen.getByText(/Witness integrity: degraded/i)).toBeTruthy();
    expect(screen.getByText(/Sentinel risk: 0\.62/i)).toBeTruthy();
  });

  it('UT-SP13-SUP-PRESENT-GUARDRAIL-ONLY — only guardrail chip rendered when guardrail_status is the only present field', () => {
    const inspect = createInspect({
      guardrail_status: 'enforced',
    });

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    expect(screen.getByText(/Guardrail: enforced/i)).toBeTruthy();
    expect(screen.queryByText(/Witness integrity:/i)).toBeNull();
    expect(screen.queryByText(/Sentinel risk:/i)).toBeNull();
  });

  it('UT-SP13-SUP-PRESENT-WITNESS-ONLY — only witness chip rendered when witness_integrity_status is the only present field', () => {
    const inspect = createInspect({
      witness_integrity_status: 'broken',
    });

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    expect(screen.getByText(/Witness integrity: broken/i)).toBeTruthy();
    expect(screen.queryByText(/Guardrail:/i)).toBeNull();
    expect(screen.queryByText(/Sentinel risk:/i)).toBeNull();
  });

  it('UT-SP13-SUP-PRESENT-SENTINEL-ONLY — only sentinel chip rendered when sentinel_risk_score is the only present field', () => {
    const inspect = createInspect({
      sentinel_risk_score: 0.1,
    });

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    expect(screen.getByText(/Sentinel risk: 0\.10/i)).toBeTruthy();
    expect(screen.queryByText(/Guardrail:/i)).toBeNull();
    expect(screen.queryByText(/Witness integrity:/i)).toBeNull();
  });

  it('UT-SP13-SUP-MIXED — supervisor section renders chips for present fields only (guardrail + sentinel, witness absent)', () => {
    const inspect = createInspect({
      guardrail_status: 'violation',
      sentinel_risk_score: 0.8,
    });

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId('mao-supervisor-section')).toBeTruthy();
    expect(screen.getByText(/Guardrail: violation/i)).toBeTruthy();
    expect(screen.getByText(/Sentinel risk: 0\.80/i)).toBeTruthy();
    expect(screen.queryByText(/Witness integrity:/i)).toBeNull();
  });

  it('UT-SP13-SUP-ABSENT-NO-PLACEHOLDER — when all three fields absent, no DOM node is emitted; no placeholder text', () => {
    const inspect = createInspect({});

    render(<MaoInspectPanel inspect={inspect} isLoading={false} />, {
      wrapper: Wrapper,
    });

    // Structural assertion: the supervisor section is not in the DOM at all.
    expect(screen.queryByTestId('mao-supervisor-section')).toBeNull();
    // Placeholder absence assertions per SUPV-SP13-018 / Goals SC-39.
    expect(screen.queryByText('N/A')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
    // No supervisor label heading should leak into the DOM either.
    expect(screen.queryByText(/^Supervisor$/)).toBeNull();
  });
});
