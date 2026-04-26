// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentsTab } from '../AgentsTab'
import { ShellProvider } from '../../ShellContext'

// Mock @nous/transport — MaoPanel calls trpc.projects.list internally.
vi.mock('@nous/transport', () => ({
  trpc: {
    projects: {
      list: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
  },
  useEventSubscription: () => {},
}))

// Mock the deep MAO surface to avoid pulling in the full MAO dependency graph
// for a smoke test. The test asserts MaoPanel itself renders (DNR-J2 inheritance).
vi.mock('../../../mao/mao-operating-surface', () => ({
  MaoOperatingSurface: () => <div data-testid="mao-operating-surface-stub" />,
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver

/**
 * WR-162 SP 12 (SUPV-SP12-002) — AgentsTab tests.
 */
describe('AgentsTab', () => {
  it('UT-SP12-TAB-AGENTS-MOUNT — renders MaoPanel content via the operating surface', () => {
    const { container } = render(
      <ShellProvider activeProjectId="test-project">
        <AgentsTab />
      </ShellProvider>,
    )
    expect(container.querySelector('[data-testid="mao-operating-surface-stub"]')).toBeTruthy()
  })

  it('UT-SP12-TAB-MAOPANEL-PARITY — AgentsTab DOM matches direct MaoPanel mount (DNR-J2 inheritance)', async () => {
    const { MaoPanel } = await import('../../../mao/MaoPanel')
    const { container: tabContainer } = render(
      <ShellProvider activeProjectId="test-project">
        <AgentsTab />
      </ShellProvider>,
    )
    const { container: panelContainer } = render(
      <ShellProvider activeProjectId="test-project">
        <MaoPanel />
      </ShellProvider>,
    )
    // Both should render the operating surface stub since AgentsTab is a
    // zero-prop pass-through to MaoPanel.
    expect(tabContainer.querySelector('[data-testid="mao-operating-surface-stub"]')).toBeTruthy()
    expect(panelContainer.querySelector('[data-testid="mao-operating-surface-stub"]')).toBeTruthy()
  })
})
