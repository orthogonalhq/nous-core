// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { reactFlowMock } from './react-flow-mock'

vi.mock('@xyflow/react', () => reactFlowMock)

import { NodePalette } from '../NodePalette'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPalette() {
  const containerRef = { current: document.createElement('div') }
  // Give the container dimensions for boundary clamping
  Object.defineProperty(containerRef.current, 'getBoundingClientRect', {
    value: () => ({
      x: 0, y: 0, width: 1200, height: 800,
      top: 0, left: 0, right: 1200, bottom: 800,
      toJSON: () => ({}),
    }),
  })

  return render(<NodePalette containerRef={containerRef} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NodePalette', () => {
  // ─── Tier 1 — Contract ────────────────────────────────────────────────────

  describe('Tier 1 — Contract', () => {
    it('renders all 7 node categories', () => {
      renderPalette()
      expect(screen.getByTestId('palette-category-trigger')).toBeTruthy()
      expect(screen.getByTestId('palette-category-agent')).toBeTruthy()
      expect(screen.getByTestId('palette-category-condition')).toBeTruthy()
      expect(screen.getByTestId('palette-category-app')).toBeTruthy()
      expect(screen.getByTestId('palette-category-tool')).toBeTruthy()
      expect(screen.getByTestId('palette-category-memory')).toBeTruthy()
      expect(screen.getByTestId('palette-category-governance')).toBeTruthy()
    })

    it('renders category labels with correct names', () => {
      renderPalette()
      expect(screen.getByText('Triggers')).toBeTruthy()
      expect(screen.getByText('Agents')).toBeTruthy()
      expect(screen.getByText('Conditions')).toBeTruthy()
      expect(screen.getByText('Apps')).toBeTruthy()
      expect(screen.getByText('Tools')).toBeTruthy()
      expect(screen.getByText('Memory')).toBeTruthy()
      expect(screen.getByText('Governance')).toBeTruthy()
    })

    it('renders Node Palette title in the floating panel header', () => {
      renderPalette()
      expect(screen.getByText('Node Palette')).toBeTruthy()
    })
  })

  // ─── Tier 2 — Behavior ───────────────────────────────────────────────────

  describe('Tier 2 — Behavior', () => {
    it('search input filters nodes by label', () => {
      renderPalette()
      const searchInput = screen.getByTestId('node-palette-search')
      fireEvent.change(searchInput, { target: { value: 'webhook' } })

      // Webhook Trigger should remain
      expect(screen.getByTestId('palette-item-nous.trigger.webhook')).toBeTruthy()
      // Other items should be filtered out
      expect(screen.queryByTestId('palette-item-nous.agent.classify')).toBeNull()
    })

    it('search input filters nodes by nousType', () => {
      renderPalette()
      const searchInput = screen.getByTestId('node-palette-search')
      fireEvent.change(searchInput, { target: { value: 'nous.memory' } })

      expect(screen.getByTestId('palette-item-nous.memory.write')).toBeTruthy()
      expect(screen.queryByTestId('palette-item-nous.trigger.webhook')).toBeNull()
    })

    it('drag initiation sets application/nous-node-type in dataTransfer', () => {
      renderPalette()
      const item = screen.getByTestId('palette-item-nous.trigger.webhook')

      const setData = vi.fn()
      fireEvent.dragStart(item, {
        dataTransfer: {
          setData,
          effectAllowed: '',
        },
      })

      expect(setData).toHaveBeenCalledWith('application/nous-node-type', 'nous.trigger.webhook')
    })

    it('category sections collapse on header click', () => {
      renderPalette()
      const header = screen.getByTestId('palette-category-header-trigger')
      fireEvent.click(header)

      // After collapse, the item should not be visible
      expect(screen.queryByTestId('palette-item-nous.trigger.webhook')).toBeNull()
    })

    it('category sections expand after collapse on second click', () => {
      renderPalette()
      const header = screen.getByTestId('palette-category-header-trigger')

      // Collapse
      fireEvent.click(header)
      expect(screen.queryByTestId('palette-item-nous.trigger.webhook')).toBeNull()

      // Expand
      fireEvent.click(header)
      expect(screen.getByTestId('palette-item-nous.trigger.webhook')).toBeTruthy()
    })
  })

  // ─── Tier 3 — Edge Case ──────────────────────────────────────────────────

  describe('Tier 3 — Edge Case', () => {
    it('empty search shows all categories and items', () => {
      renderPalette()
      const searchInput = screen.getByTestId('node-palette-search')

      // Type something then clear
      fireEvent.change(searchInput, { target: { value: 'webhook' } })
      fireEvent.change(searchInput, { target: { value: '' } })

      // All 7 items should be visible
      expect(screen.getByTestId('palette-item-nous.trigger.webhook')).toBeTruthy()
      expect(screen.getByTestId('palette-item-nous.agent.classify')).toBeTruthy()
      expect(screen.getByTestId('palette-item-nous.governance.audit-log')).toBeTruthy()
    })

    it('search with no results hides all categories', () => {
      renderPalette()
      const searchInput = screen.getByTestId('node-palette-search')
      fireEvent.change(searchInput, { target: { value: 'zzz-no-match-zzz' } })

      expect(screen.queryByTestId('palette-category-trigger')).toBeNull()
      expect(screen.queryByTestId('palette-category-agent')).toBeNull()
    })
  })
})
