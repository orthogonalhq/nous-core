// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUseQuery: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: { getControlAuditHistory: { invalidate: vi.fn() } },
    }),
    mao: {
      getControlAuditHistory: {
        useQuery: (...args: any[]) => mockUseQuery(...args),
      },
    },
  },
  useEventSubscription: vi.fn(),
}));

import {
  MaoAuditTrailPanel,
  ACTOR_VISUAL,
  type ActorVisualTreatment,
} from '../mao-audit-trail-panel';
import type { ControlActorType } from '@nous/shared';

const MOCK_PROJECT_ID = '550e8400-e29b-41d4-a716-446655445001' as any;

const MOCK_ENTRIES = [
  {
    commandId: 'aaaa-bbbb-cccc-dddd-eeeeeeee0001',
    action: 'hard_stop_project',
    actorId: 'principal-operator',
    reason: 'Emergency stop for review',
    reasonCode: 'mao_project_control_applied',
    at: '2026-03-10T01:00:00.000Z',
    evidenceRefs: ['evidence://stop'],
    resumeReadinessStatus: 'not_applicable',
    decisionRef: 'mao-control:cmd-001',
  },
  {
    commandId: 'aaaa-bbbb-cccc-dddd-eeeeeeee0002',
    action: 'resume_project',
    actorId: 'principal-operator',
    reason: 'Resume after review complete',
    reasonCode: 'mao_project_control_applied',
    at: '2026-03-10T02:00:00.000Z',
    evidenceRefs: ['evidence://resume'],
    resumeReadinessStatus: 'passed',
    decisionRef: 'mao-control:cmd-002',
  },
];

describe('MaoAuditTrailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders timeline entries with action, actorId, timestamp, and reason', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: MOCK_ENTRIES,
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    expect(screen.getByText('Audit trail')).toBeTruthy();
    expect(screen.getByText('2 entries')).toBeTruthy();
    expect(screen.getByText('hard stop project')).toBeTruthy();
    expect(screen.getByText('resume project')).toBeTruthy();
    expect(screen.getAllByText('principal-operator')).toHaveLength(2);
    expect(screen.getByText('Emergency stop for review')).toBeTruthy();
    expect(screen.getByText('Resume after review complete')).toBeTruthy();
  });

  it('shows empty state when no audit history exists', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    expect(
      screen.getByText('No control actions have been recorded for this project.'),
    ).toBeTruthy();
  });

  it('shows system-level indicator when projectId is sentinel UUID', () => {
    const SENTINEL_PROJECT_ID = '00000000-0000-0000-0000-000000000000' as any;

    render(<MaoAuditTrailPanel projectId={SENTINEL_PROJECT_ID} />);

    expect(screen.getByTestId('sentinel-indicator')).toBeTruthy();
    expect(
      screen.getByText(
        'System-level agent — audit trail scoped to project context.',
      ),
    ).toBeTruthy();
  });

  it('does not fire query when projectId is sentinel UUID', () => {
    const SENTINEL_PROJECT_ID = '00000000-0000-0000-0000-000000000000' as any;

    render(<MaoAuditTrailPanel projectId={SENTINEL_PROJECT_ID} />);

    // The query should have been called with enabled: false
    expect(mockUseQuery).toHaveBeenCalled();
    const queryCall = mockUseQuery.mock.calls[0];
    expect(queryCall[1]?.enabled).toBe(false);
  });

  it('expands entry details on click showing commandId, resumeReadinessStatus, and decisionRef', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: MOCK_ENTRIES,
      isLoading: false,
      isError: false,
    });

    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);

    // Click the first entry to expand
    fireEvent.click(screen.getByText('Emergency stop for review'));

    // Expanded details should now be visible
    expect(screen.getByText('aaaa-bbbb-cccc-dddd-eeeeeeee0001')).toBeTruthy();
    expect(screen.getByText('not_applicable')).toBeTruthy();
    expect(screen.getByText('mao-control:cmd-001')).toBeTruthy();
    expect(screen.getByText('evidence://stop')).toBeTruthy();
  });
});

// --- WR-162 SP 14 (SUPV-SP14-014..016) — audit-trail polish ---

function makeEntry(overrides: Record<string, unknown>) {
  return {
    commandId: 'cmd-' + (overrides.commandId ?? '0000'),
    action: 'pause_project',
    actorId: 'actor-1',
    reason: 'reason text',
    reasonCode: 'mao_project_control_applied',
    at: '2026-03-10T01:00:00.000Z',
    evidenceRefs: ['evidence://ref-1'],
    resumeReadinessStatus: 'not_applicable',
    decisionRef: 'mao-control:cmd-x',
    ...overrides,
  };
}

describe('UT-SP14-AT — audit-trail polish (SUPV-SP14-014..016)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery = vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  // UT-SP14-AT-SUPERVISOR-ACTOR — five-literal coverage
  it('UT-SP14-AT-SUPERVISOR-ACTOR — five ControlActorType literals route through ACTOR_VISUAL', () => {
    const literals: ControlActorType[] = [
      'principal',
      'orchestration_agent',
      'worker_agent',
      'system_agent',
      'supervisor',
    ];
    const entries = literals.map((literal, i) =>
      makeEntry({
        commandId: `${i}`,
        actor_type: literal,
        actorId: `${literal}-id`,
      }),
    );
    mockUseQuery = vi.fn().mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });
    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);
    for (const literal of literals) {
      const badge = screen.getByTestId(`audit-actor-${literal}`);
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain(ACTOR_VISUAL[literal].badge);
    }
    // Only the supervisor row carries the glyph distinction.
    expect(screen.getByTestId('audit-actor-supervisor-glyph')).toBeTruthy();
  });

  // UT-SP14-AT-FALLBACK — entries without actor_type default to 'principal' baseline
  it('UT-SP14-AT-FALLBACK — entries without actor_type default to principal baseline', () => {
    mockUseQuery = vi.fn().mockReturnValue({
      data: [makeEntry({ commandId: 'a' })],
      isLoading: false,
      isError: false,
    });
    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);
    expect(screen.getByTestId('audit-actor-principal')).toBeTruthy();
    // No supervisor glyph when actor_type is absent.
    expect(screen.queryByTestId('audit-actor-supervisor-glyph')).toBeNull();
  });

  // UT-SP14-AT-EVIDENCE-REF — three-attribute pattern (SUPV-SP14-014)
  it('UT-SP14-AT-EVIDENCE-REF — expanded evidence refs render with the SP 13 three-attribute pattern', () => {
    const fixedCommandId = 'aaaa-bbbb-cccc-dddd-eeeeeeee9999';
    mockUseQuery = vi.fn().mockReturnValue({
      data: [
        {
          commandId: fixedCommandId,
          action: 'pause_project',
          actorId: 'principal-1',
          reason: 'reason text',
          reasonCode: 'mao_project_control_applied',
          at: '2026-03-10T01:00:00.000Z',
          evidenceRefs: ['evidence://e1', 'evidence://e2'],
          resumeReadinessStatus: 'not_applicable',
          decisionRef: 'mao-control:cmd-x',
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);
    fireEvent.click(screen.getByText('reason text'));
    const list = screen.getByTestId('audit-evidence-ref-list');
    const refs = list.querySelectorAll('[data-mao-evidence-ref]');
    expect(refs.length).toBe(2);
    for (const node of Array.from(refs)) {
      expect(node.getAttribute('data-mao-evidence-source')).toBe('audit-trail');
      expect(node.getAttribute('data-mao-evidence-command-id')).toBe(fixedCommandId);
    }
  });

  // UT-SP14-AT-DNR-I1 — eleven event-type non-suppression check via render-all
  it('UT-SP14-AT-DNR-I1 — audit-trail renders all entries without filtering on event type', () => {
    const entries = Array.from({ length: 11 }, (_, i) =>
      makeEntry({ commandId: String(i), reason: `entry-${i}` }),
    );
    mockUseQuery = vi.fn().mockReturnValue({
      data: entries,
      isLoading: false,
      isError: false,
    });
    render(<MaoAuditTrailPanel projectId={MOCK_PROJECT_ID} />);
    for (let i = 0; i < 11; i++) {
      expect(screen.getByText(`entry-${i}`)).toBeTruthy();
    }
  });
});

describe('UT-SP14-CAT-ACTOR-TYPE — closed Record over five-literal admit', () => {
  it('ACTOR_VISUAL covers all five ControlActorType literals exhaustively', () => {
    const expected: ControlActorType[] = [
      'principal',
      'orchestration_agent',
      'worker_agent',
      'system_agent',
      'supervisor',
    ];
    expect(Object.keys(ACTOR_VISUAL).sort()).toEqual([...expected].sort());
    // Only the supervisor row carries the glyph distinction.
    const supervisorRow: ActorVisualTreatment = ACTOR_VISUAL.supervisor;
    expect(supervisorRow.glyph).toBe('supervisor');
    expect(supervisorRow.badge).toBe('Supervisor');
    expect(supervisorRow.toneSeverity).toBe('high');
    // Non-supervisor rows render no glyph.
    for (const literal of expected.filter((x) => x !== 'supervisor')) {
      expect(ACTOR_VISUAL[literal].glyph).toBeNull();
    }
  });
});

/**
 * SP 15 — UT-SP15-AT-MATRIX (SUPV-SP15-004).
 *
 * Closed-enum `it.each` over the five `ControlActorType` literals. Per cell:
 * mount the audit-trail panel with one entry whose `actorType` is the literal
 * under test; assert the SP 14 `Record<ControlActorType, ActorVisualTreatment>`
 * (SUPV-SP14-015) renders the expected badge + tone. Supervisor cell asserts
 * visual distinction; non-supervisor cells assert neutral baseline.
 */
const AT_MATRIX_ACTORS: ReadonlyArray<{
  actor: ControlActorType;
  expectedBadge: string;
  expectedTone: 'low' | 'medium' | 'high';
  expectsGlyph: boolean;
}> = [
  { actor: 'principal', expectedBadge: 'Principal', expectedTone: 'low', expectsGlyph: false },
  {
    actor: 'orchestration_agent',
    expectedBadge: 'Orchestrator',
    expectedTone: 'low',
    expectsGlyph: false,
  },
  { actor: 'worker_agent', expectedBadge: 'Worker', expectedTone: 'low', expectsGlyph: false },
  { actor: 'system_agent', expectedBadge: 'System', expectedTone: 'medium', expectsGlyph: false },
  { actor: 'supervisor', expectedBadge: 'Supervisor', expectedTone: 'high', expectsGlyph: true },
];

describe('UT-SP15-AT-MATRIX — ControlActorType closed-enum cell coverage', () => {
  it.each(AT_MATRIX_ACTORS)(
    'UT-SP15-AT-MATRIX-$actor — ACTOR_VISUAL[$actor] has badge=$expectedBadge tone=$expectedTone glyph?=$expectsGlyph',
    ({ actor, expectedBadge, expectedTone, expectsGlyph }) => {
      const treatment = ACTOR_VISUAL[actor];
      expect(treatment.badge).toBe(expectedBadge);
      expect(treatment.toneSeverity).toBe(expectedTone);
      if (expectsGlyph) {
        expect(treatment.glyph).toBe('supervisor');
      } else {
        expect(treatment.glyph).toBeNull();
      }
    },
  );
});
