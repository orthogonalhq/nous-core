// @vitest-environment jsdom

/* @vitest-environment jsdom */

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflowSnapshotUseQuery: vi.fn(),
  dashboardSnapshotUseQuery: vi.fn(),
  configurationSnapshotUseQuery: vi.fn(),
  listProjectQueueUseQuery: vi.fn(),
  validateWorkflowDefinitionUseMutation: vi.fn(),
  saveWorkflowDefinitionUseMutation: vi.fn(),
  updateConfigurationUseMutation: vi.fn(),
  upsertScheduleUseMutation: vi.fn(),
  acknowledgeUseMutation: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    projects: {
      workflowSnapshot: { useQuery: mocks.workflowSnapshotUseQuery },
      dashboardSnapshot: { useQuery: mocks.dashboardSnapshotUseQuery },
      configurationSnapshot: { useQuery: mocks.configurationSnapshotUseQuery },
      validateWorkflowDefinition: { useMutation: mocks.validateWorkflowDefinitionUseMutation },
      saveWorkflowDefinition: { useMutation: mocks.saveWorkflowDefinitionUseMutation },
      updateConfiguration: { useMutation: mocks.updateConfigurationUseMutation },
      upsertSchedule: { useMutation: mocks.upsertScheduleUseMutation },
    },
    escalations: {
      listProjectQueue: { useQuery: mocks.listProjectQueueUseQuery },
      acknowledge: { useMutation: mocks.acknowledgeUseMutation },
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

import ProjectsPage from '@/app/(shell)/projects/page';

describe('ProjectsPage', () => {
  const validateMutateAsync = vi.fn();
  const saveMutateAsync = vi.fn();
  const updateConfigurationMutate = vi.fn();
  const upsertScheduleMutate = vi.fn();
  const acknowledgeMutate = vi.fn();
  const workflowInvalidate = vi.fn();
  const dashboardInvalidate = vi.fn();
  const configurationInvalidate = vi.fn();
  const queueInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useProject.mockReturnValue({
      projectId: '550e8400-e29b-41d4-a716-446655443001',
      setProjectId: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn(() => null),
    });
    mocks.workflowSnapshotUseQuery.mockReturnValue({
      data: createWorkflowSnapshot(),
      isLoading: false,
    });
    mocks.dashboardSnapshotUseQuery.mockReturnValue({
      data: createDashboardSnapshot(),
      isLoading: false,
    });
    mocks.configurationSnapshotUseQuery.mockReturnValue({
      data: createConfigurationSnapshot(),
      isLoading: false,
    });
    mocks.listProjectQueueUseQuery.mockReturnValue({
      data: createQueueSnapshot(),
      isLoading: false,
    });
    mocks.validateWorkflowDefinitionUseMutation.mockReturnValue({
      mutateAsync: validateMutateAsync,
      isPending: false,
    });
    mocks.saveWorkflowDefinitionUseMutation.mockReturnValue({
      mutateAsync: saveMutateAsync,
      isPending: false,
    });
    mocks.updateConfigurationUseMutation.mockReturnValue({
      mutate: updateConfigurationMutate,
      isPending: false,
    });
    mocks.upsertScheduleUseMutation.mockReturnValue({
      mutate: upsertScheduleMutate,
      isPending: false,
    });
    mocks.acknowledgeUseMutation.mockReturnValue({
      mutate: acknowledgeMutate,
      isPending: false,
    });
    mocks.useUtils.mockReturnValue({
      projects: {
        workflowSnapshot: {
          invalidate: workflowInvalidate,
        },
        dashboardSnapshot: {
          invalidate: dashboardInvalidate,
        },
        configurationSnapshot: {
          invalidate: configurationInvalidate,
        },
      },
      escalations: {
        listProjectQueue: {
          invalidate: queueInvalidate,
        },
      },
    });
    validateMutateAsync.mockResolvedValue({
      valid: true,
      definition: createWorkflowSnapshot().workflowDefinition,
      derivedGraph: createWorkflowSnapshot().graph,
      issues: [],
    });
    saveMutateAsync.mockResolvedValue({
      project: { workflow: { definitions: [{ version: '1.0.1' }] } },
      validation: { valid: true, issues: [] },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders dashboard, configuration, queue, and workflow sections', async () => {
    render(<ProjectsPage />);

    expect(screen.getByText('Projects Operating Surface')).toBeTruthy();
    expect(screen.getByText('Project dashboard')).toBeTruthy();
    expect(screen.getByText('Configuration surface')).toBeTruthy();
    expect(screen.getByText('Escalation queue')).toBeTruthy();
    expect(screen.getByText('Run monitor')).toBeTruthy();
    expect(screen.getByText('Basic editor')).toBeTruthy();
  });

  it('validates and saves the workflow draft through the server mutations', async () => {
    render(<ProjectsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Validate draft' }));

    await waitFor(() => {
      expect(validateMutateAsync).toHaveBeenCalled();
    });
    expect(await screen.findByText('Workflow definition is valid.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save workflow' }));

    await waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalled();
    });
    expect(await screen.findByText('Workflow definition saved.')).toBeTruthy();
    expect(workflowInvalidate).toHaveBeenCalled();
  });

  it('submits configuration and escalation actions through canonical mutations', async () => {
    render(<ProjectsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(updateConfigurationMutate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(upsertScheduleMutate).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(acknowledgeMutate).toHaveBeenCalled();
  });

  it('renders inspect-first empty state when no canonical workflow definition exists', () => {
    mocks.workflowSnapshotUseQuery.mockReturnValue({
      data: createWorkflowSnapshot({
        workflowDefinition: null,
        graph: null,
        nodeProjections: [],
        project: {
          ...createWorkflowSnapshot().project,
          type: 'intent',
        },
        runtimeAvailability: 'no_active_run',
        diagnostics: {
          runtimePosture: 'single_process_local',
          inspectFirstMode: 'no-definition',
        },
      }),
      isLoading: false,
    });

    render(<ProjectsPage />);

    expect(screen.getByText('Inspect-first workflow surface')).toBeTruthy();
    expect(
      screen.getByText(/intent project has no canonical workflow definition yet/i),
    ).toBeTruthy();
  });

  it('preserves MAO handoff context in the project surface', () => {
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'mao',
          projectId: '550e8400-e29b-41d4-a716-446655443001',
          runId: '550e8400-e29b-41d4-a716-446655443004',
          nodeId: '550e8400-e29b-41d4-a716-446655443003',
          evidenceRef: 'evidence://workflow:blocked',
        };
        return values[key] ?? null;
      }),
    });

    render(<ProjectsPage />);

    expect(screen.getByText(/MAO handoff active/i)).toBeTruthy();
    expect(screen.getAllByText(/Return to MAO/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MAO-origin monitoring context is active/i)).toBeTruthy();
  });

  it('preserves marketplace handoff context in the project surface', () => {
    mocks.useSearchParams.mockReturnValue({
      get: vi.fn((key: string) => {
        const values: Record<string, string | null> = {
          source: 'marketplace',
          projectId: '550e8400-e29b-41d4-a716-446655443001',
          packageId: 'pkg.persona-engine',
          releaseId: 'release-1',
          candidateId: 'candidate-1',
        };
        return values[key] ?? null;
      }),
    });

    render(<ProjectsPage />);

    expect(screen.getByText(/Marketplace handoff active/i)).toBeTruthy();
    expect(screen.getAllByText(/Return to marketplace/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Marketplace-origin package context is active/i),
    ).toBeTruthy();
  });
});

function createWorkflowSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      id: '550e8400-e29b-41d4-a716-446655443001',
      name: 'Projects UI Test',
      type: 'hybrid',
    },
    workflowDefinition: {
      id: '550e8400-e29b-41d4-a716-446655443002',
      projectId: '550e8400-e29b-41d4-a716-446655443001',
      mode: 'hybrid',
      version: '1.0.0',
      name: 'Projects Workflow',
      entryNodeIds: ['550e8400-e29b-41d4-a716-446655443003'],
      nodes: [
        {
          id: '550e8400-e29b-41d4-a716-446655443003',
          name: 'Draft',
          type: 'model-call',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'model-call',
            modelRole: 'reasoner',
            promptRef: 'prompt://draft',
          },
        },
      ],
      edges: [],
    },
    graph: {
      workflowDefinitionId: '550e8400-e29b-41d4-a716-446655443002',
      projectId: '550e8400-e29b-41d4-a716-446655443001',
      version: '1.0.0',
      graphDigest:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      entryNodeIds: ['550e8400-e29b-41d4-a716-446655443003'],
      topologicalOrder: ['550e8400-e29b-41d4-a716-446655443003'],
      nodes: {
        '550e8400-e29b-41d4-a716-446655443003': {
          definition: {
            id: '550e8400-e29b-41d4-a716-446655443003',
            name: 'Draft',
            type: 'model-call',
            governance: 'must',
            executionModel: 'synchronous',
            config: {
              type: 'model-call',
              modelRole: 'reasoner',
              promptRef: 'prompt://draft',
            },
          },
          inboundEdgeIds: [],
          outboundEdgeIds: [],
          topologicalIndex: 0,
        },
      },
      edges: {},
    },
    runtimeAvailability: 'live',
    selectedRunId: '550e8400-e29b-41d4-a716-446655443004',
    activeRunState: {
      runId: '550e8400-e29b-41d4-a716-446655443004',
      workflowDefinitionId: '550e8400-e29b-41d4-a716-446655443002',
      projectId: '550e8400-e29b-41d4-a716-446655443001',
      workflowVersion: '1.0.0',
      graphDigest:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      status: 'running',
      admission: {
        allowed: true,
        reasonCode: 'workflow_admitted',
        evidenceRefs: ['workflow:admission'],
      },
      activeNodeIds: ['550e8400-e29b-41d4-a716-446655443003'],
      activatedEdgeIds: [],
      readyNodeIds: ['550e8400-e29b-41d4-a716-446655443003'],
      waitingNodeIds: [],
      blockedNodeIds: [],
      completedNodeIds: [],
      checkpointState: 'idle',
      nodeStates: {
        '550e8400-e29b-41d4-a716-446655443003': {
          id: '550e8400-e29b-41d4-a716-446655443005',
          nodeDefinitionId: '550e8400-e29b-41d4-a716-446655443003',
          status: 'running',
          attempts: [
            {
              attempt: 1,
              status: 'running',
              dispatchLineageId: '550e8400-e29b-41d4-a716-446655443006',
              governanceDecision: {
                outcome: 'allow_with_flag',
                reasonCode: 'CGR-ALLOW-WITH-FLAG',
                governance: 'must',
                actionCategory: 'model-invoke',
                projectControlState: 'running',
                patternId: '550e8400-e29b-41d4-a716-446655443007',
                confidence: 0.9,
                confidenceTier: 'high',
                supportingSignals: 1,
                decayState: 'stable',
                autonomyAllowed: false,
                requiresConfirmation: false,
                highRiskOverrideApplied: false,
                evidenceRefs: [],
                explanation: {
                  patternId: '550e8400-e29b-41d4-a716-446655443007',
                  outcomeRef: 'workflow:test',
                  evidenceRefs: [],
                },
              },
              sideEffectStatus: 'none',
              reasonCode: 'workflow_running',
              evidenceRefs: ['workflow:run'],
              startedAt: '2026-03-09T19:00:00.000Z',
              updatedAt: '2026-03-09T19:00:00.000Z',
            },
          ],
          activeAttempt: 1,
          correctionArcs: [],
          evidenceRefs: [],
          updatedAt: '2026-03-09T19:00:00.000Z',
        },
      },
      dispatchLineage: [],
      startedAt: '2026-03-09T19:00:00.000Z',
      updatedAt: '2026-03-09T19:00:00.000Z',
    },
    recentRuns: [],
    nodeProjections: [
      {
        nodeDefinitionId: '550e8400-e29b-41d4-a716-446655443003',
        definition: {
          id: '550e8400-e29b-41d4-a716-446655443003',
          name: 'Draft',
          type: 'model-call',
          governance: 'must',
          executionModel: 'synchronous',
          config: {
            type: 'model-call',
            modelRole: 'reasoner',
            promptRef: 'prompt://draft',
          },
        },
        nodeState: null,
        status: 'running',
        groupKey: 'status:running',
        artifactRefs: ['artifact://draft/v1'],
        traceIds: [],
        deepLinks: [
          {
            target: 'chat',
            projectId: '550e8400-e29b-41d4-a716-446655443001',
            workflowRunId: '550e8400-e29b-41d4-a716-446655443004',
            nodeDefinitionId: '550e8400-e29b-41d4-a716-446655443003',
          },
        ],
      },
    ],
    recentArtifacts: [
      {
        artifactId: '550e8400-e29b-41d4-a716-446655443008',
        version: 1,
        artifactRef: 'artifact://draft/v1',
        projectId: '550e8400-e29b-41d4-a716-446655443001',
        name: 'draft.md',
        mimeType: 'text/markdown',
        sizeBytes: 7,
        integrityRef:
          'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        writeState: 'committed',
        lineage: {
          workflowRunId: '550e8400-e29b-41d4-a716-446655443004',
          workflowNodeDefinitionId: '550e8400-e29b-41d4-a716-446655443003',
          evidenceRefs: [],
        },
        tags: ['draft'],
        createdAt: '2026-03-09T19:00:00.000Z',
        committedAt: '2026-03-09T19:00:00.000Z',
        updatedAt: '2026-03-09T19:00:00.000Z',
      },
    ],
    recentTraces: [
      {
        traceId: '550e8400-e29b-41d4-a716-446655443009',
        startedAt: '2026-03-09T19:00:00.000Z',
        completedAt: '2026-03-09T19:00:01.000Z',
        turnCount: 1,
      },
    ],
    controlProjection: {
      project_id: '550e8400-e29b-41d4-a716-446655443001',
      project_control_state: 'running',
      active_agent_count: 1,
      blocked_agent_count: 0,
      urgent_agent_count: 0,
      pfc_project_review_status: 'none',
      pfc_project_recommendation: 'continue',
    },
    diagnostics: {
      runtimePosture: 'single_process_local',
      inspectFirstMode: 'hybrid',
    },
    ...overrides,
  };
}

function createDashboardSnapshot() {
  return {
    project: createWorkflowSnapshot().project,
    health: {
      overallStatus: 'attention_required',
      runtimeAvailability: 'live',
      activeRunStatus: 'running',
      blockedNodeCount: 0,
      waitingNodeCount: 0,
      enabledScheduleCount: 1,
      overdueScheduleCount: 0,
      openEscalationCount: 1,
      urgentEscalationCount: 1,
    },
    controlProjection: createWorkflowSnapshot().controlProjection,
    workflowSnapshot: createWorkflowSnapshot(),
    schedules: [
      {
        id: '550e8400-e29b-41d4-a716-446655443010',
        projectId: '550e8400-e29b-41d4-a716-446655443001',
        workflowDefinitionId: '550e8400-e29b-41d4-a716-446655443002',
        workmodeId: 'system:implementation',
        trigger: {
          kind: 'cron',
          cron: '0 * * * *',
        },
        enabled: true,
        requestedDeliveryMode: 'none',
        nextDueAt: '2026-03-09T20:00:00.000Z',
        createdAt: '2026-03-09T19:00:00.000Z',
        updatedAt: '2026-03-09T19:00:00.000Z',
      },
    ],
    openEscalations: createQueueSnapshot().items,
    blockedActions: [
      {
        action: 'edit_project_configuration',
        allowed: true,
        message: 'Configuration edits are allowed while the project is running.',
        evidenceRefs: ['project-control:running'],
      },
      {
        action: 'update_schedule',
        allowed: true,
        message: 'Schedule updates are allowed while the project is running.',
        evidenceRefs: ['project-control:running'],
      },
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
  };
}

function createConfigurationSnapshot() {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655443001',
    updatedAt: '2026-03-09T19:00:00.000Z',
    config: {
      id: '550e8400-e29b-41d4-a716-446655443001',
      name: 'Projects UI Test',
      type: 'hybrid',
      pfcTier: 3,
      governanceDefaults: {
        defaultNodeGovernance: 'must',
        requireExplicitReviewForShouldDeviation: true,
        blockedActionFeedbackMode: 'reason_coded',
      },
      modelAssignments: {
        reasoner: '00000000-0000-0000-0000-000000000001',
      },
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      escalationChannels: ['in-app'],
      escalationPreferences: {
        routeByPriority: {
          low: ['projects'],
          medium: ['projects'],
          high: ['projects', 'chat'],
          critical: ['projects', 'chat', 'mao'],
        },
        acknowledgementSurfaces: ['projects', 'chat'],
        mirrorToChat: true,
      },
      workflow: {
        defaultWorkflowDefinitionId: '550e8400-e29b-41d4-a716-446655443002',
        definitions: [createWorkflowSnapshot().workflowDefinition],
      },
      packageDefaultIntake: [],
      retrievalBudgetTokens: 500,
      createdAt: '2026-03-09T19:00:00.000Z',
      updatedAt: '2026-03-09T19:00:00.000Z',
    },
    schedules: createDashboardSnapshot().schedules,
    blockedActions: createDashboardSnapshot().blockedActions,
    fieldProvenance: [
      {
        field: 'type',
        source: 'project_override',
        evidenceRefs: ['project-config:type'],
        lockedByPolicy: false,
      },
    ],
  };
}

function createQueueSnapshot() {
  return {
    projectId: '550e8400-e29b-41d4-a716-446655443001',
    items: [
      {
        escalationId: '550e8400-e29b-41d4-a716-446655443011',
        projectId: '550e8400-e29b-41d4-a716-446655443001',
        source: 'workflow',
        severity: 'high',
        title: 'Workflow blocked on review',
        message: 'Review and resume is required.',
        status: 'visible',
        routeTargets: ['projects', 'chat'],
        requiredAction: 'Review and resume',
        evidenceRefs: ['evidence:workflow:blocked'],
        acknowledgements: [],
        createdAt: '2026-03-09T19:00:00.000Z',
        updatedAt: '2026-03-09T19:00:00.000Z',
      },
    ],
    openCount: 1,
    acknowledgedCount: 0,
    urgentCount: 1,
  };
}
