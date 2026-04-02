import { describe, it, expect } from 'vitest'
import {
  mapRunStatus,
  mapNodeStatus,
  mapNodeState,
  mapRunStateToExecutionRun,
  mapSnapshotToExecutionRuns,
} from '../snapshot-to-execution'
import type {
  WorkflowRunState,
  WorkflowNodeRunState,
  ProjectWorkflowSurfaceSnapshot,
  WorkflowNodeMonitorProjection,
} from '@nous/shared'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper, branded IDs are opaque strings at runtime
function makeNodeRunState(overrides: Record<string, any>): WorkflowNodeRunState {
  return {
    id: crypto.randomUUID(),
    nodeDefinitionId: overrides.nodeDefinitionId ?? 'test-node',
    status: overrides.status ?? 'pending',
    attempts: overrides.attempts ?? [],
    activeAttempt: overrides.activeAttempt ?? null,
    activeWaitState: overrides.activeWaitState ?? undefined,
    lastCommittedCheckpointId: overrides.lastCommittedCheckpointId ?? undefined,
    selectedBranchKey: overrides.selectedBranchKey ?? undefined,
    correctionArcs: overrides.correctionArcs ?? [],
    reasonCode: overrides.reasonCode ?? undefined,
    evidenceRefs: overrides.evidenceRefs ?? [],
    lastDispatchLineageId: overrides.lastDispatchLineageId ?? undefined,
    joinProgress: overrides.joinProgress ?? undefined,
    updatedAt: overrides.updatedAt ?? '2026-03-31T00:00:00Z',
  } as WorkflowNodeRunState
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper, branded IDs are opaque strings at runtime
function makeRunState(overrides: Record<string, any> = {}): WorkflowRunState {
  return {
    runId: overrides.runId ?? crypto.randomUUID(),
    workflowDefinitionId: overrides.workflowDefinitionId ?? crypto.randomUUID(),
    projectId: overrides.projectId ?? crypto.randomUUID(),
    workflowVersion: overrides.workflowVersion ?? '1',
    graphDigest: overrides.graphDigest ?? 'a'.repeat(64),
    status: overrides.status ?? 'running',
    admission: overrides.admission ?? { status: 'admitted' },
    reasonCode: overrides.reasonCode ?? undefined,
    evidenceRefs: overrides.evidenceRefs ?? [],
    activeNodeIds: overrides.activeNodeIds ?? [],
    activatedEdgeIds: overrides.activatedEdgeIds ?? [],
    readyNodeIds: overrides.readyNodeIds ?? [],
    waitingNodeIds: overrides.waitingNodeIds ?? [],
    blockedNodeIds: overrides.blockedNodeIds ?? [],
    completedNodeIds: overrides.completedNodeIds ?? [],
    lastPreparedCheckpointId: overrides.lastPreparedCheckpointId ?? undefined,
    lastCommittedCheckpointId: overrides.lastCommittedCheckpointId ?? undefined,
    checkpointState: overrides.checkpointState ?? 'idle',
    triggerContext: overrides.triggerContext ?? undefined,
    nodeStates: overrides.nodeStates ?? {},
    dispatchLineage: overrides.dispatchLineage ?? [],
    startedAt: overrides.startedAt ?? '2026-03-31T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-03-31T00:01:00Z',
  } as WorkflowRunState
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper, branded IDs are opaque strings at runtime
function makeSnapshot(overrides: Record<string, any> = {}): ProjectWorkflowSurfaceSnapshot {
  return {
    project: overrides.project ?? { id: crypto.randomUUID(), name: 'Test Project' },
    workflowDefinition: overrides.workflowDefinition ?? null,
    workflowDefinitionSource: overrides.workflowDefinitionSource ?? null,
    graph: overrides.graph ?? null,
    runtimeAvailability: overrides.runtimeAvailability ?? { available: false, reason: 'test' },
    selectedRunId: overrides.selectedRunId ?? undefined,
    activeRunState: overrides.activeRunState ?? null,
    recentRuns: overrides.recentRuns ?? [],
    nodeProjections: overrides.nodeProjections ?? [],
    recentArtifacts: overrides.recentArtifacts ?? [],
    recentTraces: overrides.recentTraces ?? [],
    controlProjection: overrides.controlProjection ?? null,
    diagnostics: overrides.diagnostics ?? { issues: [], warnings: [] },
  } as ProjectWorkflowSurfaceSnapshot
}

// ─── Tier 1: Contract Tests — mapRunStatus ───────────────────────────────────

describe('mapRunStatus', () => {
  it('maps running -> running', () => {
    expect(mapRunStatus('running')).toBe('running')
  })

  it('maps completed -> completed', () => {
    expect(mapRunStatus('completed')).toBe('completed')
  })

  it('maps failed -> failed', () => {
    expect(mapRunStatus('failed')).toBe('failed')
  })

  it('maps paused -> paused', () => {
    expect(mapRunStatus('paused')).toBe('paused')
  })

  it('maps canceled -> failed', () => {
    expect(mapRunStatus('canceled')).toBe('failed')
  })

  it('maps admission_blocked -> running', () => {
    expect(mapRunStatus('admission_blocked')).toBe('running')
  })

  it('maps ready -> running', () => {
    expect(mapRunStatus('ready')).toBe('running')
  })

  it('maps waiting -> running', () => {
    expect(mapRunStatus('waiting')).toBe('running')
  })

  it('maps blocked_review -> running', () => {
    expect(mapRunStatus('blocked_review')).toBe('running')
  })
})

// ─── Tier 1: Contract Tests — mapNodeStatus ─────────────────────────────────

describe('mapNodeStatus', () => {
  it('maps pending -> pending', () => {
    expect(mapNodeStatus('pending')).toBe('pending')
  })

  it('maps completed -> completed', () => {
    expect(mapNodeStatus('completed')).toBe('completed')
  })

  it('maps failed -> failed', () => {
    expect(mapNodeStatus('failed')).toBe('failed')
  })

  it('maps skipped -> skipped', () => {
    expect(mapNodeStatus('skipped')).toBe('skipped')
  })

  it('maps blocked -> failed', () => {
    expect(mapNodeStatus('blocked')).toBe('failed')
  })

  it('maps ready -> running', () => {
    expect(mapNodeStatus('ready')).toBe('running')
  })

  it('maps running -> running', () => {
    expect(mapNodeStatus('running')).toBe('running')
  })

  it('maps waiting -> running', () => {
    expect(mapNodeStatus('waiting')).toBe('running')
  })
})

// ─── Tier 1: Contract Tests — mapNodeState ──────────────────────────────────

describe('mapNodeState', () => {
  it('maps a completed node with reasonCode null', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-a',
      status: 'completed',
      reasonCode: undefined,
    })
    const result = mapNodeState(nodeState)
    expect(result.nodeId).toBe('node-a')
    expect(result.status).toBe('completed')
    expect(result.error).toBeNull()
    expect(result.startedAt).toBeNull()
    expect(result.completedAt).toBeNull()
    expect(result.duration).toBeNull()
  })

  it('maps a failed node with reasonCode as error', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-b',
      status: 'failed',
      reasonCode: 'Timeout exceeded',
    })
    const result = mapNodeState(nodeState)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Timeout exceeded')
  })

  it('maps a running node with null timestamps', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-c',
      status: 'running',
    })
    const result = mapNodeState(nodeState)
    expect(result.status).toBe('running')
    expect(result.startedAt).toBeNull()
    expect(result.completedAt).toBeNull()
    expect(result.duration).toBeNull()
  })

  it('maps a skipped node', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-d',
      status: 'skipped',
    })
    const result = mapNodeState(nodeState)
    expect(result.status).toBe('skipped')
    expect(result.error).toBeNull()
  })

  it('collapses waiting to running', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-e',
      status: 'waiting',
    })
    const result = mapNodeState(nodeState)
    expect(result.status).toBe('running')
  })

  it('collapses blocked to failed', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-f',
      status: 'blocked',
      reasonCode: 'Dependency unavailable',
    })
    const result = mapNodeState(nodeState)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Dependency unavailable')
  })

  it('handles node with all optional fields absent', () => {
    const nodeState = makeNodeRunState({
      nodeDefinitionId: 'node-g',
      status: 'pending',
    })
    const result = mapNodeState(nodeState)
    expect(result.nodeId).toBe('node-g')
    expect(result.status).toBe('pending')
    expect(result.error).toBeNull()
  })
})

// ─── Tier 2: Behavior Tests — mapRunStateToExecutionRun ─────────────────────

describe('mapRunStateToExecutionRun', () => {
  it('produces valid ExecutionRun from a completed WorkflowRunState', () => {
    const runState = makeRunState({
      runId: 'run-100',
      workflowDefinitionId: 'wf-1',
      status: 'completed',
      startedAt: '2026-03-31T00:00:00Z',
      updatedAt: '2026-03-31T00:05:00Z',
    })
    const result = mapRunStateToExecutionRun(runState)
    expect(result.id).toBe('run-100')
    expect(result.workflowId).toBe('wf-1')
    expect(result.status).toBe('completed')
    expect(result.startedAt).toBe('2026-03-31T00:00:00Z')
    expect(result.completedAt).toBe('2026-03-31T00:05:00Z')
  })

  it('produces valid ExecutionRun from a running WorkflowRunState', () => {
    const runState = makeRunState({
      status: 'running',
      updatedAt: '2026-03-31T00:01:00Z',
    })
    const result = mapRunStateToExecutionRun(runState)
    expect(result.status).toBe('running')
    expect(result.completedAt).toBeNull()
  })

  it('sets completedAt to updatedAt for terminal runs', () => {
    const runState = makeRunState({
      status: 'failed',
      updatedAt: '2026-03-31T00:03:00Z',
    })
    const result = mapRunStateToExecutionRun(runState)
    expect(result.completedAt).toBe('2026-03-31T00:03:00Z')
  })

  it('sets completedAt to null for active runs', () => {
    const runState = makeRunState({ status: 'waiting' })
    const result = mapRunStateToExecutionRun(runState)
    expect(result.completedAt).toBeNull()
  })

  it('maps nodeStates correctly for multi-node run', () => {
    const nodeA = makeNodeRunState({ nodeDefinitionId: 'n-1', status: 'completed' })
    const nodeB = makeNodeRunState({ nodeDefinitionId: 'n-2', status: 'running' })
    const runState = makeRunState({
      nodeStates: {
        [nodeA.id]: nodeA,
        [nodeB.id]: nodeB,
      },
    })
    const result = mapRunStateToExecutionRun(runState)
    expect(result.nodeStates['n-1']).toBeDefined()
    expect(result.nodeStates['n-1'].status).toBe('completed')
    expect(result.nodeStates['n-2']).toBeDefined()
    expect(result.nodeStates['n-2'].status).toBe('running')
  })

  it('maps artifact refs from node projections when provided', () => {
    const runState = makeRunState()
    const projections = [
      {
        nodeDefinitionId: 'n-1',
        definition: {} as WorkflowNodeMonitorProjection['definition'],
        nodeState: null,
        status: 'completed',
        groupKey: 'default',
        artifactRefs: ['art-1', 'art-2'],
        traceIds: [],
        deepLinks: [],
      },
    ] as unknown as WorkflowNodeMonitorProjection[]
    const result = mapRunStateToExecutionRun(runState, projections)
    expect(result.artifactRefs!['n-1']).toHaveLength(2)
    expect(result.artifactRefs!['n-1'][0].id).toBe('art-1')
    expect(result.artifactRefs!['n-1'][0].nodeId).toBe('n-1')
    expect(result.artifactRefs!['n-1'][0].artifactType).toBe('other')
  })

  it('produces empty edgeStates, events, gateStates when not available', () => {
    const runState = makeRunState()
    const result = mapRunStateToExecutionRun(runState)
    expect(result.edgeStates).toEqual({})
    expect(result.events).toEqual([])
    expect(result.gateStates).toEqual({})
  })

  it('handles empty nodeStates map', () => {
    const runState = makeRunState({ nodeStates: {} })
    const result = mapRunStateToExecutionRun(runState)
    expect(Object.keys(result.nodeStates)).toHaveLength(0)
  })
})

// ─── Tier 2: Behavior Tests — mapSnapshotToExecutionRuns ────────────────────

describe('mapSnapshotToExecutionRuns', () => {
  it('returns empty array for snapshot with no recentRuns', () => {
    const snapshot = makeSnapshot({ recentRuns: [] })
    expect(mapSnapshotToExecutionRuns(snapshot)).toEqual([])
  })

  it('maps all runs from snapshot recentRuns', () => {
    const run1 = makeRunState({ runId: 'r-1', status: 'completed' })
    const run2 = makeRunState({ runId: 'r-2', status: 'running' })
    const snapshot = makeSnapshot({ recentRuns: [run1, run2] })
    const result = mapSnapshotToExecutionRuns(snapshot)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('r-1')
    expect(result[1].id).toBe('r-2')
  })

  it('enriches active run with node projections', () => {
    const run = makeRunState({ runId: 'r-active' })
    const projections = [
      {
        nodeDefinitionId: 'n-1',
        definition: {} as WorkflowNodeMonitorProjection['definition'],
        nodeState: null,
        status: 'completed',
        groupKey: 'default',
        artifactRefs: ['art-x'],
        traceIds: [],
        deepLinks: [],
      },
    ] as unknown as WorkflowNodeMonitorProjection[]
    const snapshot = makeSnapshot({
      recentRuns: [run],
      selectedRunId: 'r-active',
      nodeProjections: projections,
    })
    const result = mapSnapshotToExecutionRuns(snapshot)
    expect(result[0].artifactRefs!['n-1']).toHaveLength(1)
  })

  it('handles null activeRunState in snapshot', () => {
    const run = makeRunState({ runId: 'r-1' })
    const snapshot = makeSnapshot({
      recentRuns: [run],
      activeRunState: null,
    })
    const result = mapSnapshotToExecutionRuns(snapshot)
    expect(result).toHaveLength(1)
  })
})
