// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()

vi.mock('@nous/transport', () => ({
  trpc: {
    projects: {
      listWorkflowDefinitions: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}))

import { WorkflowPicker } from '../WorkflowPicker'

const defaultProps = {
  projectId: 'proj-1',
  currentDefinitionId: null as string | null,
  onSelectWorkflow: vi.fn(),
  onNewWorkflow: vi.fn(),
  containerRef: { current: null } as React.RefObject<HTMLDivElement | null>,
}

const mockDefinitions = [
  { id: 'def-1', name: 'Workflow Alpha', version: '1', isDefault: true },
  { id: 'def-2', name: 'Workflow Beta', version: '2', isDefault: false },
]

describe('WorkflowPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseQuery.mockReturnValue({
      data: mockDefinitions,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  // Tier 1 — Contract

  describe('Tier 1 — Contract', () => {
    it('renders without errors with valid props', () => {
      render(<WorkflowPicker {...defaultProps} />)
      expect(screen.getByTestId('workflow-picker')).toBeTruthy()
    })

    it('empty query result renders empty state', () => {
      mockUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      render(<WorkflowPicker {...defaultProps} />)
      expect(screen.getByTestId('workflow-picker-empty')).toBeTruthy()
      expect(screen.getByText('No workflows yet')).toBeTruthy()
    })
  })

  // Tier 2 — Behavior

  describe('Tier 2 — Behavior', () => {
    it('renders workflow names from listWorkflowDefinitions query', () => {
      render(<WorkflowPicker {...defaultProps} />)
      expect(screen.getByText('Workflow Alpha')).toBeTruthy()
      expect(screen.getByText('Workflow Beta')).toBeTruthy()
    })

    it('clicking a workflow item calls onSelectWorkflow(definitionId)', () => {
      const onSelectWorkflow = vi.fn()
      render(<WorkflowPicker {...defaultProps} onSelectWorkflow={onSelectWorkflow} />)

      fireEvent.click(screen.getByText('Workflow Alpha'))
      expect(onSelectWorkflow).toHaveBeenCalledWith('def-1')
    })

    it('clicking the currently loaded workflow does NOT call onSelectWorkflow', () => {
      const onSelectWorkflow = vi.fn()
      render(
        <WorkflowPicker
          {...defaultProps}
          currentDefinitionId="def-1"
          onSelectWorkflow={onSelectWorkflow}
        />,
      )

      fireEvent.click(screen.getByText('Workflow Alpha'))
      expect(onSelectWorkflow).not.toHaveBeenCalled()
    })

    it('"New Workflow" button calls onNewWorkflow', () => {
      const onNewWorkflow = vi.fn()
      render(<WorkflowPicker {...defaultProps} onNewWorkflow={onNewWorkflow} />)

      fireEvent.click(screen.getByTestId('workflow-picker-new'))
      expect(onNewWorkflow).toHaveBeenCalledTimes(1)
    })

    it('currently loaded workflow is visually distinguished', () => {
      render(<WorkflowPicker {...defaultProps} currentDefinitionId="def-1" />)

      const activeItem = screen.getByTestId('workflow-picker-item-def-1')
      // Active item has different background style
      expect(activeItem.style.background).toContain('var(--nous-bg-active)')
    })
  })

  // Tier 3 — Edge Cases

  describe('Tier 3 — Edge Cases', () => {
    it('loading state renders loading indicator', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      render(<WorkflowPicker {...defaultProps} />)
      expect(screen.getByTestId('workflow-picker-loading')).toBeTruthy()
    })

    it('error state renders error message', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      })

      render(<WorkflowPicker {...defaultProps} />)
      expect(screen.getByTestId('workflow-picker-error')).toBeTruthy()
      expect(screen.getByText('Failed to load workflows')).toBeTruthy()
    })
  })
})
