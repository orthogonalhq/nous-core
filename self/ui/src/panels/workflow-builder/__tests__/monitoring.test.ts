// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { useBuilderState } from '../hooks/useBuilderState'
import { DEMO_EXECUTION_RUNS } from '../monitoring/demo-execution-data'
import type {
  ExecutionRun,
  NodeExecutionState,
  EdgeFlowState,
  ExecutionEvent,
  MonitoringState,
  ExecutionRunStatus,
  ExecutionNodeStatus,
  ExecutionEdgeStatus,
  ExecutionEventType,
  GateState,
  ArtifactRef,
  DispatchPacketRef,
  RevisionCycleRef,
  EscalationRef,
  BuilderEdgeType,
} from '../../../types/workflow-builder'

// ─── Tier 1 — Contract ────────────────────────────────────────────────────────

describe('Execution types — Contract', () => {
  it('ExecutionRun interface is importable and has correct shape', () => {
    const run: ExecutionRun = DEMO_EXECUTION_RUNS[0]
    expect(run.id).toBeDefined()
    expect(run.workflowId).toBeDefined()
    expect(run.status).toBeDefined()
    expect(run.startedAt).toBeDefined()
    expect(run.nodeStates).toBeDefined()
    expect(run.edgeStates).toBeDefined()
    expect(run.events).toBeDefined()
  })

  it('NodeExecutionState has correct shape', () => {
    const state: NodeExecutionState = DEMO_EXECUTION_RUNS[0].nodeStates['node-1']
    expect(state.nodeId).toBe('node-1')
    expect(state.status).toBeDefined()
    expect('startedAt' in state).toBe(true)
    expect('completedAt' in state).toBe(true)
    expect('duration' in state).toBe(true)
    expect('error' in state).toBe(true)
  })

  it('EdgeFlowState has correct shape', () => {
    const state: EdgeFlowState = DEMO_EXECUTION_RUNS[0].edgeStates['edge-1']
    expect(state.edgeId).toBe('edge-1')
    expect(state.status).toBeDefined()
    expect(state.flowType).toBeDefined()
  })

  it('ExecutionEvent has correct shape', () => {
    const event: ExecutionEvent = DEMO_EXECUTION_RUNS[0].events[0]
    expect(event.id).toBeDefined()
    expect(event.type).toBeDefined()
    expect(event.timestamp).toBeDefined()
    expect('nodeId' in event).toBe(true)
    expect('edgeId' in event).toBe(true)
    expect(event.metadata).toBeDefined()
  })

  it('MonitoringState interface is importable', () => {
    const ms: MonitoringState = { activeRun: null, isMonitoring: false }
    expect(ms.activeRun).toBeNull()
    expect(ms.isMonitoring).toBe(false)
  })

  it('BuilderEdgeType includes memory', () => {
    const types: BuilderEdgeType[] = ['execution', 'config', 'memory']
    expect(types).toContain('memory')
  })

  it('shared downstream types are importable', () => {
    // Type-level imports verified by compilation
    const gate: GateState = { gateId: 'g1', name: 'test', status: 'pending', nodeId: 'n1' }
    const artifact: ArtifactRef = { id: 'a1', type: 'test', label: 'test', nodeId: 'n1' }
    const dispatch: DispatchPacketRef = { id: 'd1', type: 'test', sourceNodeId: 'n1', targetNodeId: 'n2' }
    const revision: RevisionCycleRef = { id: 'r1', cycle: 1, nodeId: 'n1', status: 'open' }
    const escalation: EscalationRef = { id: 'e1', severity: 'low', nodeId: 'n1', message: 'test' }
    expect(gate).toBeDefined()
    expect(artifact).toBeDefined()
    expect(dispatch).toBeDefined()
    expect(revision).toBeDefined()
    expect(escalation).toBeDefined()
  })
})

// ─── Tier 2 — Behavior: Demo execution data ─────────────────────────────────

describe('Demo execution data — Behavior', () => {
  it('provides at least 3 runs', () => {
    expect(DEMO_EXECUTION_RUNS.length).toBeGreaterThanOrEqual(3)
  })

  it('covers all ExecutionRunStatus values', () => {
    const statuses = new Set(DEMO_EXECUTION_RUNS.map((r) => r.status))
    expect(statuses.has('completed')).toBe(true)
    expect(statuses.has('running')).toBe(true)
    expect(statuses.has('failed')).toBe(true)
  })

  it('node states cover all 5 ExecutionNodeStatus values', () => {
    const allStatuses = new Set<string>()
    for (const run of DEMO_EXECUTION_RUNS) {
      for (const ns of Object.values(run.nodeStates)) {
        allStatuses.add(ns.status)
      }
    }
    expect(allStatuses.has('pending')).toBe(true)
    expect(allStatuses.has('running')).toBe(true)
    expect(allStatuses.has('completed')).toBe(true)
    expect(allStatuses.has('failed')).toBe(true)
    expect(allStatuses.has('skipped')).toBe(true)
  })

  it('edge flow states cover all 3 edge types', () => {
    const allFlowTypes = new Set<string>()
    for (const run of DEMO_EXECUTION_RUNS) {
      for (const es of Object.values(run.edgeStates)) {
        allFlowTypes.add(es.flowType)
      }
    }
    expect(allFlowTypes.has('execution')).toBe(true)
    expect(allFlowTypes.has('config')).toBe(true)
    expect(allFlowTypes.has('memory')).toBe(true)
  })

  it('each run has events', () => {
    for (const run of DEMO_EXECUTION_RUNS) {
      expect(run.events.length).toBeGreaterThan(0)
    }
  })
})

// ─── Tier 2 — Behavior: useBuilderState monitoring extensions ───────────────

describe('useBuilderState — monitoring', () => {
  it('initial monitoringState has null activeRun and isMonitoring false', () => {
    const { result } = renderHook(() => useBuilderState())
    expect(result.current.monitoringState.activeRun).toBeNull()
    expect(result.current.monitoringState.isMonitoring).toBe(false)
  })

  it('initial activeRun is null', () => {
    const { result } = renderHook(() => useBuilderState())
    expect(result.current.activeRun).toBeNull()
  })

  it('setActiveRun loads the correct run', () => {
    const { result } = renderHook(() => useBuilderState())
    act(() => {
      result.current.setMode('monitoring')
    })
    act(() => {
      result.current.setActiveRun('run-001')
    })
    expect(result.current.activeRun).not.toBeNull()
    expect(result.current.activeRun!.id).toBe('run-001')
    expect(result.current.monitoringState.isMonitoring).toBe(true)
  })

  it('clearActiveRun sets activeRun to null', () => {
    const { result } = renderHook(() => useBuilderState())
    act(() => {
      result.current.setMode('monitoring')
    })
    act(() => {
      result.current.setActiveRun('run-001')
    })
    act(() => {
      result.current.clearActiveRun()
    })
    expect(result.current.activeRun).toBeNull()
    expect(result.current.monitoringState.isMonitoring).toBe(false)
  })

  it('switching mode away from monitoring clears activeRun', () => {
    const { result } = renderHook(() => useBuilderState())
    act(() => {
      result.current.setMode('monitoring')
    })
    act(() => {
      result.current.setActiveRun('run-002')
    })
    expect(result.current.activeRun).not.toBeNull()
    act(() => {
      result.current.setMode('authoring')
    })
    expect(result.current.activeRun).toBeNull()
    expect(result.current.monitoringState.isMonitoring).toBe(false)
  })

  it('isMonitoring is false when mode is monitoring but no active run', () => {
    const { result } = renderHook(() => useBuilderState())
    act(() => {
      result.current.setMode('monitoring')
    })
    expect(result.current.mode).toBe('monitoring')
    expect(result.current.monitoringState.isMonitoring).toBe(false)
  })

  it('setActiveRun with invalid ID does not set active run', () => {
    const { result } = renderHook(() => useBuilderState())
    act(() => {
      result.current.setMode('monitoring')
    })
    act(() => {
      result.current.setActiveRun('nonexistent')
    })
    expect(result.current.activeRun).toBeNull()
  })
})
