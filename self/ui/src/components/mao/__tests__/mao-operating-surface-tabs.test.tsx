// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaoServicesProvider } from '../mao-services-context';
import type { MaoProjectSnapshot, MaoSystemSnapshot } from '@nous/shared';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

// ---- Transport mock ----

let mockGetSystemSnapshotQuery: ReturnType<typeof vi.fn>;
let mockGetProjectSnapshotQuery: ReturnType<typeof vi.fn>;
let mockGetAgentInspectProjectionQuery: ReturnType<typeof vi.fn>;
let mockGetControlAuditHistoryQuery: ReturnType<typeof vi.fn>;
let mockRequestProjectControl: ReturnType<typeof vi.fn>;
let mockUseEventSubscription: ReturnType<typeof vi.fn>;
let mockHealthSystemStatusQuery: ReturnType<typeof vi.fn>;

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: {
        getProjectSnapshot: { invalidate: vi.fn() },
        getAgentInspectProjection: { invalidate: vi.fn() },
        getProjectControlProjection: { invalidate: vi.fn() },
        getControlAuditHistory: { invalidate: vi.fn() },
        getSystemSnapshot: { invalidate: vi.fn() },
      },
      health: { systemStatus: { invalidate: vi.fn() } },
      projects: { dashboardSnapshot: { invalidate: vi.fn() } },
      escalations: { listProjectQueue: { invalidate: vi.fn() } },
    }),
    mao: {
      getSystemSnapshot: {
        useQuery: (...args: any[]) => mockGetSystemSnapshotQuery(...args),
      },
      getProjectSnapshot: {
        useQuery: (...args: any[]) => mockGetProjectSnapshotQuery(...args),
      },
      getAgentInspectProjection: {
        useQuery: (...args: any[]) => mockGetAgentInspectProjectionQuery(...args),
      },
      getControlAuditHistory: {
        useQuery: (...args: any[]) => mockGetControlAuditHistoryQuery(...args),
      },
      requestProjectControl: {
        useMutation: (...args: any[]) => mockRequestProjectControl(...args),
      },
    },
    opctl: {
      requestConfirmationProof: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
    health: {
      systemStatus: {
        useQuery: (...args: any[]) => mockHealthSystemStatusQuery(...args),
      },
    },
  },
  useEventSubscription: (...args: any[]) => mockUseEventSubscription(...args),
}));

import { MaoOperatingSurface } from '../mao-operating-surface';

// ---- Service wrapper ----

function FakeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <a href={href} className={className}>{children}</a>;
}

let currentProjectId: string | null = null;

function createWrapper(projectId: string | null = null) {
  currentProjectId = projectId;

  const mockServices = {
    Link: FakeLink,
    useProject: () => ({
      projectId: currentProjectId,
      setProjectId: (id: string | null) => { currentProjectId = id; },
    }),
    useSearchParams: () => ({ get: () => null }),
  };

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MaoServicesProvider value={mockServices}>{children}</MaoServicesProvider>;
  };
}

function createSystemSnapshot(overrides?: Partial<MaoSystemSnapshot>): MaoSystemSnapshot {
  return {
    agents: [],
    leaseRoots: [],
    projectControls: {},
    densityMode: 'D2',
    generatedAt: new Date().toISOString(),
    ...overrides,
  } as MaoSystemSnapshot;
}

function createProjectSnapshot(): MaoProjectSnapshot {
  return {
    projectId: 'project-001',
    densityMode: 'D2',
    workflowRunId: 'run-001',
    controlProjection: {
      project_control_state: 'nominal',
      pfc_project_recommendation: 'continue',
    },
    grid: [],
    graph: { nodes: [], edges: [] },
    urgentOverlay: { urgentAgentIds: [], blockedAgentIds: [] },
    summary: {
      activeAgentCount: 0,
      blockedAgentCount: 0,
      completedAgentCount: 0,
      urgentAgentCount: 0,
    },
    diagnostics: { runtimePosture: 'single_process_local' },
    generatedAt: '2026-03-29T00:00:00Z',
  } as unknown as MaoProjectSnapshot;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockGetSystemSnapshotQuery = vi.fn().mockReturnValue({
    data: createSystemSnapshot(),
    isLoading: false,
  });
  mockGetProjectSnapshotQuery = vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
  });
  mockGetAgentInspectProjectionQuery = vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
  });
  mockGetControlAuditHistoryQuery = vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
  mockRequestProjectControl = vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
  mockUseEventSubscription = vi.fn();
  mockHealthSystemStatusQuery = vi.fn().mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('MaoOperatingSurface tab behavior', () => {
  it('renders System tab by default when projectId is null', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(screen.getByTestId('system-tab-content')).toBeTruthy();
    expect(screen.queryByTestId('projects-tab-content')).toBeNull();
  });

  it('renders Projects tab when projectId is set', () => {
    mockGetProjectSnapshotQuery = vi.fn().mockReturnValue({
      data: createProjectSnapshot(),
      isLoading: false,
    });

    const Wrapper = createWrapper('project-001');

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(screen.getByTestId('projects-tab-content')).toBeTruthy();
    expect(screen.queryByTestId('system-tab-content')).toBeNull();
  });

  it('switches tabs when tab buttons are clicked', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    // Initially on system tab
    expect(screen.getByTestId('system-tab-content')).toBeTruthy();

    // Switch to projects
    fireEvent.click(screen.getByTestId('tab-projects'));
    expect(screen.getByTestId('projects-tab-content')).toBeTruthy();
    expect(screen.queryByTestId('system-tab-content')).toBeNull();

    // Switch back to system
    fireEvent.click(screen.getByTestId('tab-system'));
    expect(screen.getByTestId('system-tab-content')).toBeTruthy();
  });

  it('queries getSystemSnapshot when system tab is active', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    // System snapshot query should be called with enabled: true
    expect(mockGetSystemSnapshotQuery).toHaveBeenCalled();
    const call = mockGetSystemSnapshotQuery.mock.calls[0];
    expect(call[1]?.enabled).toBe(true);
  });

  it('queries getProjectSnapshot when projects tab is active with projectId', () => {
    mockGetProjectSnapshotQuery = vi.fn().mockReturnValue({
      data: createProjectSnapshot(),
      isLoading: false,
    });

    const Wrapper = createWrapper('project-001');

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(mockGetProjectSnapshotQuery).toHaveBeenCalled();
    const call = mockGetProjectSnapshotQuery.mock.calls[0];
    expect(call[1]?.enabled).toBe(true);
  });

  it('event subscription is active only for the current tab', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    // Two subscriptions: system (enabled=true) and projects (enabled=false since projectId=null and activeTab=system)
    const calls = mockUseEventSubscription.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Find the system subscription (the one with enabled:true)
    const systemSub = calls.find(
      (c: any[]) => c[0]?.enabled === true,
    );
    expect(systemSub).toBeTruthy();
  });

  it('bottom strip is always visible', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(screen.getByTestId('bottom-strip')).toBeTruthy();
  });

  it('renders tab bar', () => {
    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(screen.getByTestId('tab-bar')).toBeTruthy();
    expect(screen.getByTestId('tab-system')).toBeTruthy();
    expect(screen.getByTestId('tab-projects')).toBeTruthy();
  });

  it('system tab shows system health strip when snapshot is loaded', () => {
    mockGetSystemSnapshotQuery = vi.fn().mockReturnValue({
      data: createSystemSnapshot({
        agents: [],
        projectControls: { 'p1': {} as any },
      }),
      isLoading: false,
    });

    const Wrapper = createWrapper(null);

    render(
      <Wrapper>
        <MaoOperatingSurface />
      </Wrapper>,
    );

    expect(screen.getByTestId('system-health-strip')).toBeTruthy();
  });
});
