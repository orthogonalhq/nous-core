// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { reactFlowMock } from '../../__tests__/react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import {
  trpcMock,
  mockWorkflowSnapshotResult,
  mockUseEventSubscription,
} from '../../__tests__/trpc-mock'
vi.mock('@nous/transport', () => trpcMock)

import { useBuilderState } from '../useBuilderState'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_PROJECT_ID = 'proj-test-001'

function makeMinimalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    project: { id: TEST_PROJECT_ID, name: 'Test' },
    workflowDefinition: null,
    workflowDefinitionSource: null,
    graph: null,
    runtimeAvailability: { available: false, reason: 'test' },
    selectedRunId: undefined,
    activeRunState: null,
    recentRuns: [],
    nodeProjections: [],
    recentArtifacts: [],
    recentTraces: [],
    controlProjection: null,
    diagnostics: { issues: [], warnings: [] },
    ...overrides,
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockWorkflowSnapshotResult.data = undefined
  mockWorkflowSnapshotResult.isLoading = false
  mockWorkflowSnapshotResult.isError = false
  mockUseEventSubscription.mockImplementation(() => {})
})

// ─── Tier 2: Behavior — SSE subscription gating ─────────────────────────────

describe('useBuilderState — SSE subscription', () => {
  it('is enabled when mode is monitoring and projectId is present', () => {
    renderHook(() => useBuilderState('monitoring', { projectId: TEST_PROJECT_ID }))

    // useEventSubscription should have been called
    expect(mockUseEventSubscription).toHaveBeenCalled()
    const lastCall = mockUseEventSubscription.mock.calls[mockUseEventSubscription.mock.calls.length - 1][0]
    expect(lastCall.enabled).toBe(true)
    expect(lastCall.channels).toEqual(['workflow:node-status-changed', 'workflow:run-completed'])
  })

  it('is disabled when mode is not monitoring', () => {
    renderHook(() => useBuilderState('authoring', { projectId: TEST_PROJECT_ID }))

    expect(mockUseEventSubscription).toHaveBeenCalled()
    const lastCall = mockUseEventSubscription.mock.calls[mockUseEventSubscription.mock.calls.length - 1][0]
    expect(lastCall.enabled).toBe(false)
  })

  it('is disabled when projectId is absent', () => {
    renderHook(() => useBuilderState('monitoring'))

    expect(mockUseEventSubscription).toHaveBeenCalled()
    const lastCall = mockUseEventSubscription.mock.calls[mockUseEventSubscription.mock.calls.length - 1][0]
    expect(lastCall.enabled).toBe(false)
  })
})

// ─── Tier 2: Behavior — workflowSnapshot query ──────────────────────────────

describe('useBuilderState — workflowSnapshot query', () => {
  it('is enabled in monitoring mode with projectId', () => {
    renderHook(() => useBuilderState('monitoring', { projectId: TEST_PROJECT_ID }))

    const queryMock = trpcMock.trpc.projects.workflowSnapshot.useQuery
    expect(queryMock).toHaveBeenCalled()
    const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1]
    expect(lastCall[0]).toEqual({ projectId: TEST_PROJECT_ID })
    expect(lastCall[1].enabled).toBe(true)
  })

  it('is disabled in authoring mode', () => {
    renderHook(() => useBuilderState('authoring', { projectId: TEST_PROJECT_ID }))

    const queryMock = trpcMock.trpc.projects.workflowSnapshot.useQuery
    expect(queryMock).toHaveBeenCalled()
    const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1]
    expect(lastCall[1].enabled).toBe(false)
  })
})

// ─── Tier 2: Behavior — executionRuns data flow ─────────────────────────────

describe('useBuilderState — executionRuns', () => {
  it('is empty when snapshot has no runs', () => {
    mockWorkflowSnapshotResult.data = makeMinimalSnapshot({ recentRuns: [] })

    const { result } = renderHook(() =>
      useBuilderState('monitoring', { projectId: TEST_PROJECT_ID }),
    )
    expect(result.current.executionRuns).toEqual([])
  })

  it('is empty when projectId is absent', () => {
    const { result } = renderHook(() => useBuilderState('monitoring'))
    expect(result.current.executionRuns).toEqual([])
  })

  it('maps runs from snapshot data', () => {
    const runId = crypto.randomUUID()
    const wfDefId = crypto.randomUUID()
    mockWorkflowSnapshotResult.data = makeMinimalSnapshot({
      recentRuns: [
        {
          runId,
          workflowDefinitionId: wfDefId,
          projectId: TEST_PROJECT_ID,
          workflowVersion: '1',
          graphDigest: 'a'.repeat(64),
          status: 'completed',
          admission: { status: 'admitted' },
          evidenceRefs: [],
          activeNodeIds: [],
          activatedEdgeIds: [],
          readyNodeIds: [],
          waitingNodeIds: [],
          blockedNodeIds: [],
          completedNodeIds: [],
          checkpointState: 'idle',
          nodeStates: {},
          dispatchLineage: [],
          startedAt: '2026-03-31T00:00:00Z',
          updatedAt: '2026-03-31T00:05:00Z',
        },
      ],
    })

    const { result } = renderHook(() =>
      useBuilderState('monitoring', { projectId: TEST_PROJECT_ID }),
    )
    expect(result.current.executionRuns).toHaveLength(1)
    expect(result.current.executionRuns[0].id).toBe(runId)
    expect(result.current.executionRuns[0].status).toBe('completed')
  })
})
