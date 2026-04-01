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

    it('new props onSaveAs, onNewWorkflow, isSaving are accepted', () => {
      // Renders without error
      expect(() => {
        render(
          <BuilderToolbar
            {...defaultProps}
            onSaveAs={vi.fn()}
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

    it('"Save As" button renders and calls onSaveAs on click', () => {
      const onSaveAs = vi.fn()
      render(<BuilderToolbar {...defaultProps} onSaveAs={onSaveAs} />)
      const saveAsBtn = screen.getByTestId('toolbar-save-as')
      fireEvent.click(saveAsBtn)
      expect(onSaveAs).toHaveBeenCalledTimes(1)
    })

    it('"New Workflow" button renders and calls onNewWorkflow on click', () => {
      const onNewWorkflow = vi.fn()
      render(<BuilderToolbar {...defaultProps} onNewWorkflow={onNewWorkflow} />)
      const newBtn = screen.getByTestId('toolbar-new-workflow')
      fireEvent.click(newBtn)
      expect(onNewWorkflow).toHaveBeenCalledTimes(1)
    })

    it('Save and Save As disabled when isSaving is true', () => {
      render(
        <BuilderToolbar
          {...defaultProps}
          isDirty={true}
          isSaving={true}
          onSaveAs={vi.fn()}
        />,
      )
      expect(screen.getByTestId('toolbar-save').hasAttribute('disabled')).toBe(true)
      expect(screen.getByTestId('toolbar-save-as').hasAttribute('disabled')).toBe(true)
    })

    it('Save As button not disabled when isDirty is false (always available in authoring)', () => {
      render(
        <BuilderToolbar
          {...defaultProps}
          isDirty={false}
          isSaving={false}
          onSaveAs={vi.fn()}
        />,
      )
      expect(screen.getByTestId('toolbar-save-as').hasAttribute('disabled')).toBe(false)
    })

    it('Save As and New Workflow buttons hidden when callbacks not provided', () => {
      render(<BuilderToolbar {...defaultProps} />)
      expect(screen.queryByTestId('toolbar-save-as')).toBeNull()
      expect(screen.queryByTestId('toolbar-new-workflow')).toBeNull()
    })
  })
})
