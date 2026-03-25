// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

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
  })
})
