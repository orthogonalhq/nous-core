// @vitest-environment jsdom

import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflowSnapshotUseQuery: vi.fn(),
  validateWorkflowDefinitionUseMutation: vi.fn(),
  saveWorkflowDefinitionUseMutation: vi.fn(),
  useUtils: vi.fn(),
  useProject: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    projects: {
      workflowSnapshot: { useQuery: mocks.workflowSnapshotUseQuery },
      validateWorkflowDefinition: { useMutation: mocks.validateWorkflowDefinitionUseMutation },
      saveWorkflowDefinition: { useMutation: mocks.saveWorkflowDefinitionUseMutation },
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
  const invalidate = vi.fn();

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
      data: createSnapshot(),
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
    mocks.useUtils.mockReturnValue({
      projects: {
        workflowSnapshot: {
          invalidate,
        },
      },
    });
    validateMutateAsync.mockResolvedValue({
      valid: true,
      definition: createSnapshot().workflowDefinition,
      derivedGraph: createSnapshot().graph,
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

  it('renders workflow monitoring projections and deep-link surfaces', async () => {
    render(<ProjectsPage />);

    expect(screen.getByText('Projects Workflow Surface')).toBeTruthy();
    expect(screen.getByText('Run monitor')).toBeTruthy();
    expect(screen.getByText('Recent artifacts')).toBeTruthy();
    expect(screen.getAllByText('Recent traces').length).toBeGreaterThan(0);
    expect(screen.getByText('Linked surfaces')).toBeTruthy();
    expect(screen.getAllByText('artifact://draft/v1').length).toBeGreaterThan(0);

    expect(await screen.findByText('Attempt 1')).toBeTruthy();
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
    expect(invalidate).toHaveBeenCalled();
  });

  it('renders inspect-first empty state when no canonical workflow definition exists', () => {
    mocks.workflowSnapshotUseQuery.mockReturnValue({
      data: createSnapshot({
        workflowDefinition: null,
        graph: null,
        nodeProjections: [],
        project: {
          ...createSnapshot().project,
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
});

function createSnapshot(overrides: Record<string, unknown> = {}) {
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
    recentRuns: [
      {
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
        nodeStates: {},
        dispatchLineage: [],
        startedAt: '2026-03-09T19:00:00.000Z',
        updatedAt: '2026-03-09T19:00:00.000Z',
      },
    ],
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
        nodeState: {
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
          {
            target: 'artifact',
            projectId: '550e8400-e29b-41d4-a716-446655443001',
            workflowRunId: '550e8400-e29b-41d4-a716-446655443004',
            nodeDefinitionId: '550e8400-e29b-41d4-a716-446655443003',
            artifactRef: 'artifact://draft/v1',
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
