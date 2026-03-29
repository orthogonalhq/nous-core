// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObservePanel } from '../ObservePanel'
import { ShellProvider } from '../ShellContext'

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as any).ResizeObserver = MockResizeObserver

// ---- Transport mock (required by MaoOperatingSurface) ----

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      mao: {
        getProjectSnapshot: { invalidate: vi.fn() },
        getAgentInspectProjection: { invalidate: vi.fn() },
        getProjectControlProjection: { invalidate: vi.fn() },
        getControlAuditHistory: { invalidate: vi.fn() },
        getSystemSnapshot: { invalidate: vi.fn() },
      },
      health: { systemStatus: { invalidate: vi.fn() } },
      projects: { dashboardSnapshot: { invalidate: vi.fn() } },
      escalations: { listProjectQueue: { invalidate: vi.fn() } },
    }),
    mao: {
      getSystemSnapshot: {
        useQuery: vi.fn().mockReturnValue({ data: null, isLoading: true }),
      },
      getProjectSnapshot: {
        useQuery: vi.fn().mockReturnValue({ data: null, isLoading: true }),
      },
      getAgentInspectProjection: {
        useQuery: vi.fn().mockReturnValue({ data: null, isLoading: true }),
      },
      getControlAuditHistory: {
        useQuery: vi.fn().mockReturnValue({ data: null, isLoading: true }),
      },
      requestProjectControl: {
        useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
      },
    },
    opctl: {
      requestConfirmationProof: {
        useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
      },
    },
    health: {
      systemStatus: {
        useQuery: vi.fn().mockReturnValue({ data: null, isLoading: true }),
      },
    },
  },
  useEventSubscription: vi.fn(),
}))

describe('ObservePanel', () => {
  it('renders without crashing when wrapped in ShellProvider', () => {
    render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
  })

  it('accepts className prop', () => {
    render(
      <ShellProvider>
        <ObservePanel className="test-class" />
      </ShellProvider>,
    )
  })

  it('renders canonical MaoOperatingSurface when activeRoute is workflows', () => {
    render(
      <ShellProvider activeRoute="workflows">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('MAO Operating Surface')).toBeTruthy()
  })

  it('renders canonical MaoOperatingSurface when activeRoute is workflow-detail', () => {
    render(
      <ShellProvider activeRoute="workflow-detail">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('MAO Operating Surface')).toBeTruthy()
  })

  it('renders default placeholder when activeRoute is home', () => {
    render(
      <ShellProvider activeRoute="home">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('No observe content for this view')).toBeTruthy()
  })

  it('renders default placeholder when activeRoute is skills', () => {
    render(
      <ShellProvider activeRoute="skills">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(screen.getByText('No observe content for this view')).toBeTruthy()
  })
})
