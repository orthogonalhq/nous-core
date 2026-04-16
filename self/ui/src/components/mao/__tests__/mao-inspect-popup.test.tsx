// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaoAgentProjection, MaoProjectSnapshot } from '@nous/shared';
import { MaoServicesProvider } from '../mao-services-context';

// Mock transport
let mockInspectUseQuery: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: {
        getControlAuditHistory: { invalidate: vi.fn() },
      },
    }),
    mao: {
      getAgentInspectProjection: {
        useQuery: (...args: any[]) => mockInspectUseQuery(...args),
      },
      getControlAuditHistory: {
        useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false, isError: false }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}));

import { MaoInspectPopup } from '../mao-inspect-popup';

function FakeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <a href={href} className={className}>{children}</a>;
}

const mockServices = {
  Link: FakeLink,
  useProject: () => ({ projectId: 'proj-001', setProjectId: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MaoServicesProvider value={mockServices}>{children}</MaoServicesProvider>;
}

function createAgent(
  overrides?: Partial<MaoAgentProjection>,
): MaoAgentProjection {
  return {
    agent_id: 'agent-001',
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

beforeEach(() => {
  vi.clearAllMocks();
  mockInspectUseQuery = vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('MaoInspectPopup', () => {
  it('renders popup when open=true with data-testid', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.getByTestId('inspect-popup')).toBeTruthy();
  });

  it('does not render when open=false', () => {
    render(
      <Wrapper>
        <MaoInspectPopup
          open={false}
          onClose={vi.fn()}
          agent={null}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.queryByTestId('inspect-popup')).toBeNull();
  });

  it('fires onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('inspect-popup-close'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on Escape key', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on backdrop click', () => {
    const handleClose = vi.fn();
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={handleClose}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('inspect-popup-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders MaoInspectPanel inside popup', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    // MaoInspectPanel renders "Inspect panel" as its card title
    expect(screen.getByText('Inspect panel')).toBeTruthy();
  });

  it('renders audit trail panel inside popup', () => {
    const agent = createAgent();

    render(
      <Wrapper>
        <MaoInspectPopup
          open={true}
          onClose={vi.fn()}
          agent={agent}
          projectSnapshot={null}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Audit trail')).toBeTruthy();
  });
});
