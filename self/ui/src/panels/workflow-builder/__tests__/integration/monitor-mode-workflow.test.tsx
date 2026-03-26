// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { useBuilderState } from '../../hooks/useBuilderState'

/**
 * Integration test: Monitor mode workflow
 *
 * Tests the cross-component coordination between useBuilderState (mode +
 * monitoring state), WorkflowBuilderPanel (interaction disabling), and the
 * monitoring overlay/history components.
 *
 * Since WorkflowBuilderPanel requires a full React Flow context, this test
 * validates the hook-level behavior that drives the panel behavior.
 */
describe('Monitor mode workflow — Integration', () => {
  it('switching to monitoring mode changes mode state', () => {
    const { result } = renderHook(() => useBuilderState())
    expect(result.current.mode).toBe('authoring')

    act(() => {
      result.current.setMode('monitoring')
    })

    expect(result.current.mode).toBe('monitoring')
    // nodesDraggable and nodesConnectable would be set to false in the panel
    // based on mode !== 'monitoring' — verified at hook level
  })

  it('selecting a run from history populates monitoring state', () => {
    const { result } = renderHook(() => useBuilderState())

    act(() => {
      result.current.setMode('monitoring')
    })

    // Simulate history panel selecting a run
    act(() => {
      result.current.setActiveRun('run-001')
    })

    expect(result.current.activeRun).not.toBeNull()
    expect(result.current.activeRun!.id).toBe('run-001')
    expect(result.current.monitoringState.isMonitoring).toBe(true)
    expect(result.current.monitoringState.activeRun!.id).toBe('run-001')
  })

  it('switching back to authoring clears monitoring state and re-enables interactions', () => {
    const { result } = renderHook(() => useBuilderState())

    // Enter monitoring mode with active run
    act(() => {
      result.current.setMode('monitoring')
    })
    act(() => {
      result.current.setActiveRun('run-002')
    })
    expect(result.current.monitoringState.isMonitoring).toBe(true)

    // Switch back to authoring
    act(() => {
      result.current.setMode('authoring')
    })

    expect(result.current.mode).toBe('authoring')
    expect(result.current.activeRun).toBeNull()
    expect(result.current.monitoringState.isMonitoring).toBe(false)
    // nodesDraggable and nodesConnectable would be true (mode !== 'monitoring')
  })

  it('full cycle: authoring -> monitoring -> select run -> switch run -> back to authoring', () => {
    const { result } = renderHook(() => useBuilderState())

    // Start in authoring
    expect(result.current.mode).toBe('authoring')

    // Switch to monitoring
    act(() => { result.current.setMode('monitoring') })
    expect(result.current.mode).toBe('monitoring')

    // Select run 1
    act(() => { result.current.setActiveRun('run-001') })
    expect(result.current.activeRun!.id).toBe('run-001')

    // Switch to run 2
    act(() => { result.current.setActiveRun('run-002') })
    expect(result.current.activeRun!.id).toBe('run-002')

    // Clear active run
    act(() => { result.current.clearActiveRun() })
    expect(result.current.activeRun).toBeNull()
    expect(result.current.mode).toBe('monitoring') // still in monitoring mode

    // Back to authoring
    act(() => { result.current.setMode('authoring') })
    expect(result.current.mode).toBe('authoring')
    expect(result.current.activeRun).toBeNull()
  })

  it('switching to inspecting mode also clears monitoring state', () => {
    const { result } = renderHook(() => useBuilderState())

    act(() => { result.current.setMode('monitoring') })
    act(() => { result.current.setActiveRun('run-003') })
    expect(result.current.activeRun!.id).toBe('run-003')

    act(() => { result.current.setMode('inspecting') })
    expect(result.current.mode).toBe('inspecting')
    expect(result.current.activeRun).toBeNull()
  })
})
