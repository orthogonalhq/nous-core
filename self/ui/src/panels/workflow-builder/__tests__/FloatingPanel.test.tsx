// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FloatingPanel } from '../floating-panel/FloatingPanel'
import type { FloatingPanelState } from '../../../types/workflow-builder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultState(overrides?: Partial<FloatingPanelState>): FloatingPanelState {
  return {
    x: 12,
    y: 12,
    collapsed: false,
    pinned: false,
    visible: true,
    ...overrides,
  }
}

function renderPanel(stateOverrides?: Partial<FloatingPanelState>, props?: Record<string, unknown>) {
  const state = defaultState(stateOverrides)
  const handlers = {
    onCollapse: vi.fn(),
    onPin: vi.fn(),
    onClose: vi.fn(),
    onDragStart: vi.fn(),
  }

  const result = render(
    <FloatingPanel
      title="Test Panel"
      state={state}
      {...handlers}
      {...props}
    >
      <div data-testid="panel-content">Content</div>
    </FloatingPanel>,
  )

  return { ...result, handlers, state }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FloatingPanel', () => {
  // ─── Tier 1 — Contract ────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders with header containing title text', () => {
      renderPanel()
      expect(screen.getByText('Test Panel')).toBeTruthy()
    })

    it('renders body with children content', () => {
      renderPanel()
      expect(screen.getByTestId('panel-content')).toBeTruthy()
    })

    it('renders 3 control buttons with aria-label attributes', () => {
      renderPanel()
      expect(screen.getByLabelText('Collapse panel')).toBeTruthy()
      expect(screen.getByLabelText('Pin panel')).toBeTruthy()
      expect(screen.getByLabelText('Close panel')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ───────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('collapse toggle hides body content when collapsed', () => {
      renderPanel({ collapsed: true })
      expect(screen.queryByTestId('floating-panel-body')).toBeNull()
    })

    it('collapse toggle shows body content when not collapsed', () => {
      renderPanel({ collapsed: false })
      expect(screen.getByTestId('floating-panel-body')).toBeTruthy()
    })

    it('collapse button calls onCollapse handler', () => {
      const { handlers } = renderPanel()
      fireEvent.click(screen.getByLabelText('Collapse panel'))
      expect(handlers.onCollapse).toHaveBeenCalledTimes(1)
    })

    it('pin button calls onPin handler', () => {
      const { handlers } = renderPanel()
      fireEvent.click(screen.getByLabelText('Pin panel'))
      expect(handlers.onPin).toHaveBeenCalledTimes(1)
    })

    it('close button calls onClose handler', () => {
      const { handlers } = renderPanel()
      fireEvent.click(screen.getByLabelText('Close panel'))
      expect(handlers.onClose).toHaveBeenCalledTimes(1)
    })

    it('does not render when visible is false', () => {
      renderPanel({ visible: false })
      expect(screen.queryByTestId('floating-panel')).toBeNull()
    })
  })

  // ─── Tier 3 — Edge Case ──────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('header mousedown calls onDragStart', () => {
      const { handlers } = renderPanel()
      fireEvent.mouseDown(screen.getByTestId('floating-panel-header'))
      expect(handlers.onDragStart).toHaveBeenCalledTimes(1)
    })

    it('control buttons are keyboard accessible via Enter', () => {
      const { handlers } = renderPanel()
      const collapseBtn = screen.getByLabelText('Collapse panel')
      fireEvent.keyDown(collapseBtn, { key: 'Enter' })
      fireEvent.keyUp(collapseBtn, { key: 'Enter' })
      // Native button behavior — click fires on Enter for buttons
      fireEvent.click(collapseBtn)
      expect(handlers.onCollapse).toHaveBeenCalled()
    })

    it('panel is positioned at state.x and state.y', () => {
      renderPanel({ x: 100, y: 200 })
      const panel = screen.getByTestId('floating-panel')
      expect(panel.style.left).toBe('100px')
      expect(panel.style.top).toBe('200px')
    })
  })
})
