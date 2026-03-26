// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { reactFlowMock } from '../react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { useBuilderState } from '../../hooks/useBuilderState'
import type { BuilderMode } from '../../../../types/workflow-builder'

/**
 * Integration test: Monitor mode workflow
 *
 * Tests the cross-component coordination between useBuilderState (mode +
 * monitoring state), WorkflowBuilderPanel (interaction disabling), and the
 * monitoring overlay/history components.
 *
 * Mode is now a parameter to useBuilderState (SP 3.1.2), so mode switching
 * is simulated via renderHook rerender.
 */
describe('Monitor mode workflow — Integration', () => {
  it('monitoring mode is accepted as parameter', () => {
    const { result } = renderHook(
      ({ mode }) => useBuilderState(mode),
      { initialProps: { mode: 'monitoring' as BuilderMode } },
    )
    // In monitoring mode, mutations are blocked at state layer
    const initialCount = result.current.nodes.length
    act(() => {
      result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
    })
    expect(result.current.nodes.length).toBe(initialCount)
  })

  it('selecting a run from history populates monitoring state', () => {
    const { result } = renderHook(
      ({ mode }) => useBuilderState(mode),
      { initialProps: { mode: 'monitoring' as BuilderMode } },
    )

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
    const { result, rerender } = renderHook(
      ({ mode }) => useBuilderState(mode),
      { initialProps: { mode: 'monitoring' as BuilderMode } },
    )

    // Enter monitoring mode with active run
    act(() => {
      result.current.setActiveRun('run-002')
    })
    expect(result.current.monitoringState.isMonitoring).toBe(true)

    // Switch back to authoring
    rerender({ mode: 'authoring' as BuilderMode })

    expect(result.current.activeRun).toBeNull()
    expect(result.current.monitoringState.isMonitoring).toBe(false)

    // Mutations should work again
    const initialCount = result.current.nodes.length
    act(() => {
      result.current.addNode('nous.trigger.webhook', { x: 0, y: 0 })
    })
    expect(result.current.nodes.length).toBe(initialCount + 1)
  })

  it('full cycle: authoring -> monitoring -> select run -> switch run -> back to authoring', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => useBuilderState(mode),
      { initialProps: { mode: 'authoring' as BuilderMode } },
    )

    // Switch to monitoring
    rerender({ mode: 'monitoring' as BuilderMode })

    // Select run 1
    act(() => { result.current.setActiveRun('run-001') })
    expect(result.current.activeRun!.id).toBe('run-001')

    // Switch to run 2
    act(() => { result.current.setActiveRun('run-002') })
    expect(result.current.activeRun!.id).toBe('run-002')

    // Clear active run
    act(() => { result.current.clearActiveRun() })
    expect(result.current.activeRun).toBeNull()

    // Back to authoring
    rerender({ mode: 'authoring' as BuilderMode })
    expect(result.current.activeRun).toBeNull()
  })

  it('switching to inspecting mode also clears monitoring state', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => useBuilderState(mode),
      { initialProps: { mode: 'monitoring' as BuilderMode } },
    )

    act(() => { result.current.setActiveRun('run-003') })
    expect(result.current.activeRun!.id).toBe('run-003')

    rerender({ mode: 'inspecting' as BuilderMode })
    expect(result.current.activeRun).toBeNull()
  })
})
