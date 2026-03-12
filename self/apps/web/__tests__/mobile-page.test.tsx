// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  operationsSnapshotUseQuery: vi.fn(),
  acknowledgeUseMutation: vi.fn(),
  listProjectQueueInvalidate: vi.fn(),
  dashboardInvalidate: vi.fn(),
  mobileInvalidate: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    mobile: {
      operationsSnapshot: { useQuery: mocks.operationsSnapshotUseQuery },
    },
    escalations: {
      acknowledge: { useMutation: mocks.acknowledgeUseMutation },
      listProjectQueue: { useQuery: vi.fn() },
    },
    projects: {
      dashboardSnapshot: { useQuery: vi.fn() },
    },
    useUtils: mocks.useUtils,
  },
}));

vi.mock('@/lib/project-context', () => ({
  useProject: mocks.useProject,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mocks.useSearchParams,
}));

import MobilePage from '@/app/(shell)/mobile/page';

describe('MobilePage', () => {
  const acknowledgeMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655446001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'mao',
          projectId: '550e8400-e29b-41d4-a716-446655446001',
          runId: '550e8400-e29b-41d4-a716-446655446002',
          nodeId: '550e8400-e29b-41d4-a716-446655446003',
          evidenceRef: 'evidence://mobile',
          reasoningRef: 'evidence://reasoning',
        };
        return values[key] ?? null;
      }),
    });
    mocks.operationsSnapshotUseQuery.mockReturnValue({
      data: createMobileSnapshot(),
      isLoading: false,
    });
    mocks.acknowledgeUseMutation.mockReturnValue({
      mutate: acknowledgeMutate,
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      mobile: {
        operationsSnapshot: { invalidate: mocks.mobileInvalidate },
      },
      escalations: {
        listProjectQueue: { invalidate: mocks.listProjectQueueInvalidate },
      },
      projects: {
        dashboardSnapshot: { invalidate: mocks.dashboardInvalidate },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the mobile operating surface with continuity and follow-up posture', () => {
    render(<MobilePage />);

    expect(screen.getByText('Mobile Operations Surface')).toBeTruthy();
    expect(screen.getByText(/MAO handoff active/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Escalations.*open.*urgent/i })).toBeTruthy();
    expect(screen.getByText('Follow-up posture')).toBeTruthy();
    expect(screen.getByText(/Text confirmation targets/i)).toBeTruthy();
  });

  it('acknowledges escalations through the canonical mobile mutation surface', () => {
    render(<MobilePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge on mobile' }));

    expect(acknowledgeMutate).toHaveBeenCalledWith({
      escalationId: '550e8400-e29b-41d4-a716-446655446010',
      surface: 'mobile',
      actorType: 'principal',
      note: 'Acknowledged from Mobile',
    });
  });
});

function createMobileSnapshot() {
  return {
    project: {
      id: '550e8400-e29b-41d4-a716-446655446001',
      name: 'Mobile UI Test',
      type: 'hybrid',
    },
    dashboard: {
      project: {
        id: '550e8400-e29b-41d4-a716-446655446001',
        name: 'Mobile UI Test',
        type: 'hybrid',
      },
      health: {
        overallStatus: 'attention_required',
        runtimeAvailability: 'live',
        activeRunStatus: 'running',
        blockedNodeCount: 0,
        waitingNodeCount: 1,
        enabledScheduleCount: 1,
        overdueScheduleCount: 0,
        openEscalationCount: 1,
        urgentEscalationCount: 1,
      },
      controlProjection: null,
      workflowSnapshot: null,
      schedules: [],
      openEscalations: [],
      blockedActions: [
        {
          action: 'acknowledge_escalation',
          allowed: true,
          message: 'Escalations may be acknowledged while the project is running.',
          evidenceRefs: ['project-control:running'],
        },
      ],
      packageDefaultIntake: [],
      diagnostics: {
        runtimePosture: 'single_process_local',
      },
    },
    escalationQueue: {
      projectId: '550e8400-e29b-41d4-a716-446655446001',
      items: [
        {
          escalationId: '550e8400-e29b-41d4-a716-446655446010',
          projectId: '550e8400-e29b-41d4-a716-446655446001',
          source: 'workflow',
          severity: 'critical',
          title: 'Mobile escalation',
          message: 'Inspect the mobile queue item.',
          status: 'visible',
          routeTargets: ['projects', 'chat', 'mobile'],
          evidenceRefs: ['evidence://mobile'],
          acknowledgements: [],
          createdAt: '2026-03-09T19:00:00.000Z',
          updatedAt: '2026-03-09T19:00:00.000Z',
        },
      ],
      openCount: 1,
      acknowledgedCount: 0,
      urgentCount: 1,
    },
    voiceSession: {
      session_id: '550e8400-e29b-41d4-a716-446655446011',
      project_id: '550e8400-e29b-41d4-a716-446655446001',
      principal_id: 'principal',
      current_turn_state: 'awaiting_text_confirmation',
      assistant_output_state: 'idle',
      degraded_mode: {
        session_id: '550e8400-e29b-41d4-a716-446655446011',
        project_id: '550e8400-e29b-41d4-a716-446655446001',
        active: false,
        evidence_refs: [],
      },
      pending_confirmation: {
        required: true,
        dual_channel_required: false,
        text_surface_targets: ['mobile'],
      },
      continuation_required: false,
      evidence_refs: [],
      updated_at: '2026-03-09T19:00:00.000Z',
    },
    endpointTrust: {
      projectId: '550e8400-e29b-41d4-a716-446655446001',
      peripheralCount: 1,
      trustedPeripheralCount: 1,
      suspendedPeripheralCount: 0,
      revokedPeripheralCount: 0,
      sensoryEndpointCount: 1,
      actionEndpointCount: 0,
      activeSessionCount: 1,
      expiringSessionCount: 1,
      registryBlockedEndpointCount: 0,
      diagnostics: {},
    },
    diagnostics: {
      runtimePosture: 'single_process_local',
    },
    generatedAt: '2026-03-09T19:00:00.000Z',
  };
}
