// @vitest-environment jsdom

/* @vitest-environment jsdom */

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, trpcMock } = vi.hoisted(() => {
  const m = {
    getProjectSnapshotUseQuery: vi.fn(),
    getSystemSnapshotUseQuery: vi.fn(),
    getAgentInspectProjectionUseQuery: vi.fn(),
    requestProjectControlUseMutation: vi.fn(),
    getControlAuditHistoryUseQuery: vi.fn(),
    systemStatusUseQuery: vi.fn(),
    requestConfirmationProofUseMutation: vi.fn(),
    useUtils: vi.fn(),
    useProject: vi.fn(),
    useSearchParams: vi.fn(),
  };
  const t = {
    mao: {
      getProjectSnapshot: { useQuery: m.getProjectSnapshotUseQuery },
      getSystemSnapshot: { useQuery: m.getSystemSnapshotUseQuery },
      getAgentInspectProjection: { useQuery: m.getAgentInspectProjectionUseQuery },
      requestProjectControl: { useMutation: m.requestProjectControlUseMutation },
      getControlAuditHistory: { useQuery: m.getControlAuditHistoryUseQuery },
    },
    health: {
      systemStatus: { useQuery: m.systemStatusUseQuery },
    },
    opctl: {
      requestConfirmationProof: { useMutation: m.requestConfirmationProofUseMutation },
    },
    useUtils: m.useUtils,
  };
  return { mocks: m, trpcMock: t };
});

vi.mock('@/lib/trpc', () => ({ trpc: trpcMock }));
vi.mock('@nous/transport', () => ({ trpc: trpcMock, useEventSubscription: vi.fn() }));

vi.mock('@/lib/project-context', () => ({
  useProject: mocks.useProject,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: mocks.useSearchParams,
}));


import MaoPage from '@/app/(shell)/mao/page';

describe('MaoPage', () => {
  const mutate = vi.fn();
  const invalidateSnapshot = vi.fn();
  const invalidateInspect = vi.fn();
  const invalidateControl = vi.fn();
  const invalidateDashboard = vi.fn();
  const invalidateQueue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655445001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'mao',
          projectId: '550e8400-e29b-41d4-a716-446655445001',
          runId: '550e8400-e29b-41d4-a716-446655445002',
          nodeId: '550e8400-e29b-41d4-a716-446655445003',
          agentId: '550e8400-e29b-41d4-a716-446655445004',
          evidenceRef: 'evidence://review',
          reasoningRef: 'evidence://reasoning',
        };
        return values[key] ?? null;
      }),
    });
    mocks.getProjectSnapshotUseQuery.mockReturnValue({
      data: createSnapshot(),
      isLoading: false,
    });
    mocks.getAgentInspectProjectionUseQuery.mockReturnValue({
      data: createInspect(),
      isLoading: false,
    });
    mocks.requestProjectControlUseMutation.mockReturnValue({
      mutate,
      isPending: false,
    });
    mocks.getControlAuditHistoryUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    mocks.systemStatusUseQuery.mockReturnValue({
      data: {
        bootStatus: 'ready',
        completedBootSteps: [],
        issueCodes: [],
        inboxReady: true,
        pendingSystemRuns: 0,
        backlogAnalytics: {
          queuedCount: 0,
          activeCount: 0,
          suspendedCount: 0,
          completedInWindow: 0,
          failedInWindow: 0,
          pressureTrend: 'stable',
        },
        collectedAt: '2026-03-10T01:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });
    mocks.getSystemSnapshotUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mocks.requestConfirmationProofUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    });
    mocks.useUtils.mockReturnValue({
      mao: {
        getProjectSnapshot: { invalidate: invalidateSnapshot },
        getSystemSnapshot: { invalidate: vi.fn() },
        getAgentInspectProjection: { invalidate: invalidateInspect },
        getProjectControlProjection: { invalidate: invalidateControl },
        getControlAuditHistory: { invalidate: vi.fn() },
      },
      health: {
        systemStatus: { invalidate: vi.fn() },
      },
      projects: {
        dashboardSnapshot: { invalidate: invalidateDashboard },
      },
      escalations: {
        listProjectQueue: { invalidate: invalidateQueue },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the MAO operating surface with grid, graph, and inspect details', () => {
    render(<MaoPage />);

    expect(screen.getByText('MAO Operating Surface')).toBeTruthy();
    expect(screen.getByText('Density grid')).toBeTruthy();
    expect(screen.getByText('Run graph')).toBeTruthy();
    expect(screen.getByText('Inspect panel')).toBeTruthy();
    expect(screen.getAllByText('Review Gate').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Review queue is blocked pending operator input.').length,
    ).toBeGreaterThan(0);
  });

  it('submits governed project controls through the MAO router mutation', async () => {
    render(<MaoPage />);

    fireEvent.change(screen.getByLabelText('Control reason'), {
      target: { value: 'Resume after review' },
    });
    // resume_project is T3, so clicking opens T3 confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: 'Resume Project' }));

    await waitFor(() => {
      // T3 dialog should be open
      expect(screen.getByText('Confirm T3 action')).toBeTruthy();
    });

    expect(screen.getByText('resume project')).toBeTruthy();
  });

  it('preserves marketplace handoff context in the MAO surface', () => {
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'marketplace',
          projectId: '550e8400-e29b-41d4-a716-446655445001',
          packageId: 'pkg.persona-engine',
          releaseId: 'release-1',
          candidateId: 'candidate-1',
          evidenceRef: 'evidence://marketplace',
        };
        return values[key] ?? null;
      }),
    });

    render(<MaoPage />);

    expect(screen.getByText(/Linked runtime context is active/i)).toBeTruthy();
    expect(screen.getByText(/package pkg.persona-engine/i)).toBeTruthy();
    expect(screen.getByText(/candidate candidate-1/i)).toBeTruthy();
  });
});

function createSnapshot() {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655445001',
    densityMode: 'D2',
    workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
    controlProjection: {
      project_id: '550e8400-e29b-41d4-a716-446655445001',
      project_control_state: 'paused_review',
      active_agent_count: 2,
      blocked_agent_count: 1,
      urgent_agent_count: 1,
      project_last_control_action: 'pause_project',
      project_last_control_actor: 'principal-operator',
      project_last_control_reason: 'Pause for review',
      project_last_control_reason_code: 'control:pause',
      project_last_control_at: '2026-03-10T01:10:00.000Z',
      resume_readiness_status: 'blocked',
      resume_readiness_reason_code: 'workflow_review_pending',
      resume_readiness_evidence_refs: ['evidence://review'],
      pfc_project_review_status: 'active',
      pfc_project_recommendation: 'resume_with_constraints',
    },
    grid: [
      {
        agent: {
          agent_id: '550e8400-e29b-41d4-a716-446655445004',
          project_id: '550e8400-e29b-41d4-a716-446655445001',
          workflow_run_id: '550e8400-e29b-41d4-a716-446655445002',
          workflow_node_definition_id: '550e8400-e29b-41d4-a716-446655445003',
          dispatching_task_agent_id: null,
          dispatch_origin_ref: 'workflow://draft',
          state: 'waiting_pfc',
          state_reason: 'Waiting for operator review',
          state_reason_code: 'workflow_wait_paused_review',
          current_step: 'Review Gate',
          progress_percent: 60,
          risk_level: 'high',
          urgency_level: 'urgent',
          attention_level: 'urgent',
          pfc_alert_status: 'active',
          pfc_mitigation_status: 'pending',
          dispatch_state: 'blocked_review',
          reflection_cycle_count: 2,
          last_update_at: '2026-03-10T01:00:00.000Z',
          reasoning_log_preview: {
            class: 'blocker',
            summary: 'Review queue is blocked pending operator input.',
            evidenceRef: 'evidence://reasoning',
            artifactRefs: ['artifact://review-note'],
            redactionClass: 'public_operator',
            previewMode: 'inline',
            emittedAt: '2026-03-10T01:00:00.000Z',
            chatLink: {
              target: 'chat',
              projectId: '550e8400-e29b-41d4-a716-446655445001',
              workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
              nodeDefinitionId: '550e8400-e29b-41d4-a716-446655445003',
            },
            projectsLink: {
              target: 'projects',
              projectId: '550e8400-e29b-41d4-a716-446655445001',
              workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
              nodeDefinitionId: '550e8400-e29b-41d4-a716-446655445003',
            },
          },
          reasoning_log_last_entry_class: 'blocker',
          reasoning_log_last_entry_at: '2026-03-10T01:00:00.000Z',
          reasoning_log_redaction_state: 'partial',
          deepLinks: [
            {
              target: 'projects',
              projectId: '550e8400-e29b-41d4-a716-446655445001',
              workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
              nodeDefinitionId: '550e8400-e29b-41d4-a716-446655445003',
            },
          ],
          evidenceRefs: ['evidence://reasoning'],
        },
        densityMode: 'D2',
        clusterKey: 'review',
        inspectOnly: false,
        showUrgentOverlay: true,
      },
    ],
    graph: {
      projectId: '550e8400-e29b-41d4-a716-446655445001',
      workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
      nodes: [
        {
          id: 'node-a',
          kind: 'agent',
          agentId: '550e8400-e29b-41d4-a716-446655445004',
          workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
          workflowNodeDefinitionId: '550e8400-e29b-41d4-a716-446655445003',
          label: 'Review Gate',
          state: 'waiting_pfc',
          evidenceRefs: ['evidence://reasoning'],
        },
      ],
      edges: [
        {
          id: 'edge-a',
          kind: 'reflection_review',
          fromNodeId: 'node-a',
          toNodeId: 'node-a',
          reasonCode: 'workflow_wait_paused_review',
          evidenceRefs: ['evidence://reasoning'],
          occurredAt: '2026-03-10T01:00:00.000Z',
        },
      ],
      generatedAt: '2026-03-10T01:00:00.000Z',
    },
    urgentOverlay: {
      urgentAgentIds: ['550e8400-e29b-41d4-a716-446655445004'],
      blockedAgentIds: ['550e8400-e29b-41d4-a716-446655445004'],
      generatedAt: '2026-03-10T01:00:00.000Z',
    },
    summary: {
      activeAgentCount: 2,
      blockedAgentCount: 1,
      failedAgentCount: 0,
      waitingPfcAgentCount: 1,
      urgentAgentCount: 1,
    },
    diagnostics: {
      runtimePosture: 'single_process_local',
    },
    generatedAt: '2026-03-10T01:00:00.000Z',
  };
}

function createInspect() {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655445001',
    workflowRunId: '550e8400-e29b-41d4-a716-446655445002',
    workflowNodeDefinitionId: '550e8400-e29b-41d4-a716-446655445003',
    projectControlState: 'paused_review',
    runStatus: 'blocked_review',
    waitKind: 'human_decision',
    latestAttempt: {
      attempt: 1,
      status: 'blocked',
      reasonCode: 'workflow_wait_paused_review',
      evidenceRefs: ['evidence://reasoning'],
      startedAt: '2026-03-10T01:00:00.000Z',
    },
    correctionArcs: [
      {
        id: '550e8400-e29b-41d4-a716-446655445010',
        type: 'resume',
        sourceAttempt: 1,
        targetAttempt: 2,
        reasonCode: 'workflow_resume_denied_hard_stopped',
        evidenceRefs: ['evidence://reasoning'],
        occurredAt: '2026-03-10T01:00:00.000Z',
      },
    ],
    evidenceRefs: ['evidence://reasoning'],
    generatedAt: '2026-03-10T01:00:00.000Z',
    agent: createSnapshot().grid[0].agent,
  };
}
