// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildWorkflowsSection } from '../useWorkflows'

// --- buildWorkflowsSection tests (pure function, no React hooks needed) ---

describe('buildWorkflowsSection', () => {
  const mockNavigate = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an AssetSection with id "workflows" and label "WORKFLOWS"', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.id).toBe('workflows')
    expect(section.label).toBe('WORKFLOWS')
    expect(section.collapsible).toBe(true)
    expect(section.disabled).toBe(false)
  })

  it('returns empty items array when no workflows', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toEqual([])
  })

  it('maps workflows to items with workflow-detail::<id> routeIds', () => {
    const workflows = [
      { id: 'def-1', name: 'First Workflow' },
      { id: 'def-2', name: 'Second Workflow' },
    ]

    const section = buildWorkflowsSection({
      workflows,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items).toHaveLength(2)
    expect(section.items[0].id).toBe('def-1')
    expect(section.items[0].label).toBe('First Workflow')
    expect(section.items[0].routeId).toBe('workflow-detail::def-1')
    expect(section.items[1].id).toBe('def-2')
    expect(section.items[1].label).toBe('Second Workflow')
    expect(section.items[1].routeId).toBe('workflow-detail::def-2')
  })

  it('sets correct indicatorColor for workflow items', () => {
    const workflows = [{ id: 'def-1', name: 'Test Workflow' }]

    const section = buildWorkflowsSection({
      workflows,
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.items[0].indicatorColor).toBe('#4CAF50')
  })

  it('wires onAdd callback from params', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.onAdd).toBe(mockOnAdd)
    section.onAdd!()
    expect(mockOnAdd).toHaveBeenCalledOnce()
  })

  it('section is collapsible and not disabled', () => {
    const section = buildWorkflowsSection({
      workflows: [],
      loading: false,
      error: null,
      onAdd: mockOnAdd,
      navigate: mockNavigate,
    })

    expect(section.collapsible).toBe(true)
    expect(section.disabled).toBe(false)
  })
})
