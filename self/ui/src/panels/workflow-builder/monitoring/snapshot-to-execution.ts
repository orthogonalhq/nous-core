/**
 * Mapping utilities: server WorkflowRunState → client ExecutionRun.
 *
 * Transforms `ProjectWorkflowSurfaceSnapshot` data from the tRPC
 * `workflowSnapshot` query into the `ExecutionRun` type consumed by
 * `ExecutionMonitor`, `ExecutionHistory`, `GatePanel`, and `ArtifactBrowser`.
 *
 * Phase 4.2 — Client Monitoring Wiring (WR-108)
 */

import type {
  WorkflowRunState,
  WorkflowRunStatus,
  WorkflowNodeRunState,
  WorkflowNodeRunStatus,
  ProjectWorkflowSurfaceSnapshot,
  WorkflowNodeMonitorProjection,
} from '@nous/shared'
import type {
  ExecutionRun,
  ExecutionRunStatus,
  NodeExecutionState,
  ExecutionNodeStatus,
  ArtifactRef,
} from '../../../types/workflow-builder'

// ─── Run-level status mapping ────────────────────────────────────────────────

/** Terminal run statuses that indicate the run is no longer executing. */
const TERMINAL_RUN_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  'completed',
  'failed',
  'canceled',
])

/**
 * Map server WorkflowRunStatus (10-value) to client ExecutionRunStatus (4-value).
 *
 * Collapses active statuses to `running`, terminal to their equivalents,
 * and `canceled` to `failed` (no client `canceled` status).
 */
export function mapRunStatus(serverStatus: WorkflowRunStatus): ExecutionRunStatus {
  switch (serverStatus) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'paused':
      return 'paused'
    case 'canceled':
      return 'failed'
    // Active states: admission_blocked, ready, running, waiting, blocked_review
    default:
      return 'running'
  }
}

// ─── Node-level status mapping ───────────────────────────────────────────────

/**
 * Map server WorkflowNodeRunStatus (8-value) to client ExecutionNodeStatus (5-value).
 *
 * Collapses waiting states to `running`, `blocked` to `failed`.
 */
export function mapNodeStatus(serverStatus: WorkflowNodeRunStatus): ExecutionNodeStatus {
  switch (serverStatus) {
    case 'pending':
      return 'pending'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'skipped'
    case 'blocked':
      return 'failed'
    // Active states: ready, running, waiting
    default:
      return 'running'
  }
}

/**
 * Map a server WorkflowNodeRunState to the client NodeExecutionState.
 *
 * Timestamps are not available on the server shape; set to null.
 * Error maps from `reasonCode` for failed/blocked nodes.
 */
export function mapNodeState(nodeState: WorkflowNodeRunState): NodeExecutionState {
  const status = mapNodeStatus(nodeState.status)
  const isFailed = nodeState.status === 'failed' || nodeState.status === 'blocked'

  return {
    nodeId: nodeState.nodeDefinitionId,
    status,
    startedAt: null,
    completedAt: null,
    duration: null,
    error: isFailed ? (nodeState.reasonCode ?? null) : null,
  }
}

// ─── Artifact ref mapping ────────────────────────────────────────────────────

/**
 * Map node projection artifact ref strings to structured ArtifactRef objects.
 * Creates placeholder objects with the string ID as both `id` and `label`.
 */
function mapArtifactRefs(
  nodeDefinitionId: string,
  artifactRefStrings: string[],
): ArtifactRef[] {
  return artifactRefStrings.map((refId) => ({
    id: refId,
    type: 'artifact',
    label: refId,
    nodeId: nodeDefinitionId,
    artifactType: 'other' as const,
  }))
}

// ─── Run-level mapping ───────────────────────────────────────────────────────

/**
 * Map a single WorkflowRunState to an ExecutionRun.
 *
 * Optionally enriches artifact refs from node projections when provided.
 * Edge states, events, and gate states are not available from the server
 * shape and are set to empty structures.
 */
export function mapRunStateToExecutionRun(
  runState: WorkflowRunState,
  nodeProjections?: WorkflowNodeMonitorProjection[],
): ExecutionRun {
  const status = mapRunStatus(runState.status)
  const isTerminal = TERMINAL_RUN_STATUSES.has(runState.status)

  // Map node states
  const nodeStates: Record<string, NodeExecutionState> = {}
  for (const [_key, nodeRunState] of Object.entries(runState.nodeStates)) {
    const mapped = mapNodeState(nodeRunState)
    nodeStates[mapped.nodeId] = mapped
  }

  // Map artifact refs from node projections
  const artifactRefs: Record<string, ArtifactRef[]> = {}
  if (nodeProjections) {
    for (const projection of nodeProjections) {
      if (projection.artifactRefs.length > 0) {
        artifactRefs[projection.nodeDefinitionId] = mapArtifactRefs(
          projection.nodeDefinitionId,
          projection.artifactRefs,
        )
      }
    }
  }

  return {
    id: runState.runId,
    workflowId: runState.workflowDefinitionId,
    status,
    startedAt: runState.startedAt,
    completedAt: isTerminal ? runState.updatedAt : null,
    nodeStates,
    edgeStates: {},
    events: [],
    gateStates: {},
    artifactRefs,
  }
}

// ─── Snapshot-level mapping ──────────────────────────────────────────────────

/**
 * Map all recentRuns from a ProjectWorkflowSurfaceSnapshot to ExecutionRun[].
 *
 * Uses the snapshot's nodeProjections to enrich artifact data for the
 * active run (identified by selectedRunId).
 */
export function mapSnapshotToExecutionRuns(
  snapshot: ProjectWorkflowSurfaceSnapshot,
): ExecutionRun[] {
  if (!snapshot.recentRuns || snapshot.recentRuns.length === 0) {
    return []
  }

  return snapshot.recentRuns.map((runState) => {
    // Enrich the selected/active run with node projections
    const isActiveRun = snapshot.selectedRunId === runState.runId
    const projections = isActiveRun ? snapshot.nodeProjections : undefined
    return mapRunStateToExecutionRun(runState, projections)
  })
}
