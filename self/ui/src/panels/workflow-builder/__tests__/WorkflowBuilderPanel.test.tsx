// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { trpcMock } from './trpc-mock'
vi.mock('@nous/transport', () => trpcMock)

import { WorkflowBuilderPanel } from '../WorkflowBuilderPanel'
import type { WorkflowBuilderPanelCoreProps } from '../WorkflowBuilderPanel'

describe('WorkflowBuilderPanel', () => {
  // ─── Tier 1 — Contract ──────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders without crashing with core props', () => {
      expect(() => render(<WorkflowBuilderPanel />)).not.toThrow()
    })

    it('exports WorkflowBuilderPanelCoreProps type', () => {
      // Type-level verification — if this compiles, the export exists
      const _props: WorkflowBuilderPanelCoreProps | undefined = undefined
      expect(_props).toBeUndefined()
    })
  })

  // ─── Tier 2 — Behavior ─────────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('renders React Flow canvas element', () => {
      render(<WorkflowBuilderPanel />)
      expect(screen.getByTestId('react-flow')).toBeTruthy()
    })

    it('renders BuilderToolbar with mode buttons (Author, Monitor, Inspect)', () => {
      render(<WorkflowBuilderPanel />)
      expect(screen.getByText('Author')).toBeTruthy()
      expect(screen.getByText('Monitor')).toBeTruthy()
      expect(screen.getByText('Inspect')).toBeTruthy()
    })

    it('renders Validate button with data-testid="toolbar-validate"', () => {
      render(<WorkflowBuilderPanel />)
      expect(screen.getByTestId('toolbar-validate')).toBeTruthy()
    })

    it('renders Save button with data-testid="toolbar-save"', () => {
      render(<WorkflowBuilderPanel />)
      expect(screen.getByTestId('toolbar-save')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Phase 2 Integration ────────────────────────────────────────

  describe('Tier 2 — Phase 2 Integration', () => {
    it('renders toolbar Validate button', () => {
      render(<WorkflowBuilderPanel />)
      const validateBtn = screen.getByTestId('toolbar-validate')
      expect(validateBtn).toBeTruthy()
      expect(validateBtn.getAttribute('aria-label')).toBe('Toggle validation panel')
    })

    it('renders toolbar Save button', () => {
      render(<WorkflowBuilderPanel />)
      const saveBtn = screen.getByTestId('toolbar-save')
      expect(saveBtn).toBeTruthy()
      expect(saveBtn.getAttribute('aria-label')).toBe('Save workflow')
    })

    it('Save button is disabled when not dirty', () => {
      render(<WorkflowBuilderPanel />)
      const saveBtn = screen.getByTestId('toolbar-save') as HTMLButtonElement
      expect(saveBtn.disabled).toBe(true)
    })

    it('canvas wrapper div has tabIndex for keyboard focus', () => {
      const { container } = render(<WorkflowBuilderPanel />)
      const wrapper = container.querySelector('[tabindex="0"]')
      expect(wrapper).toBeTruthy()
    })
  })

  // ─── Tier 2 — Phase 1.2 Props ─────────────────────────────────────────────

  describe('Tier 2 — Phase 1.2 Props', () => {
    it('renders without crashing when projectId is provided', () => {
      expect(() =>
        render(<WorkflowBuilderPanel className="test" projectId="proj-123" />),
      ).not.toThrow()
    })

    it('renders without crashing when projectId is not provided (backward compat)', () => {
      expect(() =>
        render(<WorkflowBuilderPanel />),
      ).not.toThrow()
    })

    it('renders without crashing when both projectId and workflowDefinitionId are provided', () => {
      expect(() =>
        render(
          <WorkflowBuilderPanel
            className="test"
            projectId="proj-123"
            workflowDefinitionId="wf-456"
          />,
        ),
      ).not.toThrow()
    })

    it('accepts WorkflowBuilderPanelCoreProps with all optional fields', () => {
      // Type-level verification — if this compiles, the interface is correct
      const props: WorkflowBuilderPanelCoreProps = {
        className: 'test',
        projectId: 'proj-123',
        workflowDefinitionId: 'wf-456',
      }
      expect(props.projectId).toBe('proj-123')
      expect(props.workflowDefinitionId).toBe('wf-456')
    })
  })

  // ─── Tier 3 — Phase 2 Authoring Flow ─────────────────────────────────────

  describe('Tier 3 — Phase 2 Authoring Flow', () => {
    it('toolbar validate button toggles validation panel visibility', () => {
      render(<WorkflowBuilderPanel />)
      const validateBtn = screen.getByTestId('toolbar-validate')

      // Click to open
      fireEvent.click(validateBtn)
      expect(screen.getByTestId('validation-panel')).toBeTruthy()

      // Click to close
      fireEvent.click(validateBtn)
      expect(screen.queryByTestId('validation-panel')).toBeNull()
    })

    it('all toolbar buttons have aria-label attributes', () => {
      render(<WorkflowBuilderPanel />)
      // Mode buttons
      expect(screen.getByLabelText('Author mode')).toBeTruthy()
      expect(screen.getByLabelText('Monitor mode')).toBeTruthy()
      expect(screen.getByLabelText('Inspect mode')).toBeTruthy()
      // Zoom buttons
      expect(screen.getByLabelText('Zoom in')).toBeTruthy()
      expect(screen.getByLabelText('Zoom out')).toBeTruthy()
      expect(screen.getByLabelText('Fit view')).toBeTruthy()
      // Undo/Redo
      expect(screen.getByLabelText('Undo')).toBeTruthy()
      expect(screen.getByLabelText('Redo')).toBeTruthy()
      // Save/Validate/AutoLayout
      expect(screen.getByLabelText('Save workflow')).toBeTruthy()
      expect(screen.getByLabelText('Toggle validation panel')).toBeTruthy()
      expect(screen.getByLabelText('Auto layout')).toBeTruthy()
    })
  })
})
