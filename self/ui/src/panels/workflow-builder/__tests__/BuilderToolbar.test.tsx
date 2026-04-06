// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

// Mock BuilderModeContext used inside BuilderToolbar
vi.mock('../context/BuilderModeContext', () => ({
  useBuilderMode: () => ({ mode: 'authoring', setMode: vi.fn() }),
}))

import { BuilderToolbar } from '../BuilderToolbar'

const defaultProps = {
  mode: 'authoring' as const,
  onModeChange: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: false,
  canRedo: false,
  onSave: vi.fn(),
  onValidate: vi.fn(),
  isDirty: false,
  isSaving: false,
  validationErrorCount: 0,
  isValidationPanelOpen: false,
}

describe('BuilderToolbar — Persistence actions', () => {
  // Tier 1 — Contract

  describe('Tier 1 — Contract', () => {
    it('save button disabled when isSaving is true', () => {
      render(<BuilderToolbar {...defaultProps} isDirty={true} isSaving={true} />)
      const saveBtn = screen.getByTestId('toolbar-save')
      expect(saveBtn.hasAttribute('disabled')).toBe(true)
    })

    it('new props onNewWorkflow, isSaving are accepted', () => {
      // Renders without error
      expect(() => {
        render(
          <BuilderToolbar
            {...defaultProps}
            onNewWorkflow={vi.fn()}
            isSaving={false}
          />,
        )
      }).not.toThrow()
    })
  })

  // Tier 2 — Behavior

  describe('Tier 2 — Behavior', () => {
    it('save button title is "Save workflow (Ctrl+S)" — not Phase 3 placeholder', () => {
      render(<BuilderToolbar {...defaultProps} />)
      const saveBtn = screen.getByTestId('toolbar-save')
      expect(saveBtn.getAttribute('title')).toBe('Save workflow (Ctrl+S)')
      expect(saveBtn.getAttribute('title')).not.toContain('Phase 3')
    })

    it('"New Workflow" button renders and calls onNewWorkflow on click', () => {
      const onNewWorkflow = vi.fn()
      render(<BuilderToolbar {...defaultProps} onNewWorkflow={onNewWorkflow} />)
      const newBtn = screen.getByTestId('toolbar-new-workflow')
      fireEvent.click(newBtn)
      expect(onNewWorkflow).toHaveBeenCalledTimes(1)
    })

    it('Save disabled when isSaving is true', () => {
      render(
        <BuilderToolbar
          {...defaultProps}
          isDirty={true}
          isSaving={true}
        />,
      )
      expect(screen.getByTestId('toolbar-save').hasAttribute('disabled')).toBe(true)
    })

    it('New Workflow button hidden when callback not provided', () => {
      render(<BuilderToolbar {...defaultProps} />)
      expect(screen.queryByTestId('toolbar-new-workflow')).toBeNull()
    })
  })
})

describe('BuilderToolbar — Delete action', () => {
  // Tier 1 — Contract

  describe('Tier 1 — Contract', () => {
    it('onDelete prop is accepted without error', () => {
      expect(() => {
        render(<BuilderToolbar {...defaultProps} onDelete={vi.fn()} />)
      }).not.toThrow()
    })

    it('delete button not rendered when onDelete is undefined', () => {
      render(<BuilderToolbar {...defaultProps} />)
      expect(screen.queryByTestId('toolbar-delete')).toBeNull()
    })
  })

  // Tier 2 — Behavior

  describe('Tier 2 — Behavior', () => {
    it('delete button renders when onDelete is provided', () => {
      render(<BuilderToolbar {...defaultProps} onDelete={vi.fn()} />)
      expect(screen.getByTestId('toolbar-delete')).toBeDefined()
    })

    it('delete button calls onDelete on click', () => {
      const onDelete = vi.fn()
      render(<BuilderToolbar {...defaultProps} onDelete={onDelete} />)
      fireEvent.click(screen.getByTestId('toolbar-delete'))
      expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('delete button is enabled in authoring mode (context mock default)', () => {
      // The module-level mock sets useBuilderMode to return 'authoring' mode.
      // In authoring mode, the delete button should be enabled.
      const onDelete = vi.fn()
      render(<BuilderToolbar {...defaultProps} onDelete={onDelete} />)
      const deleteBtn = screen.getByTestId('toolbar-delete')
      expect(deleteBtn.hasAttribute('disabled')).toBe(false)
    })
  })
})
