// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusBar } from '../StatusBar'
import { ObservePanel } from '../ObservePanel'
import { ShellProvider } from '../ShellContext'

// Mock the deep MAO surface and dashboard widgets so the panel content mounts
// shallowly — the test focuses on click-through wiring, not panel content.
vi.mock('../../mao/MaoPanel', () => ({
  MaoPanel: () => <div data-testid="agents-tab-content" />,
}))
vi.mock('../SystemActivitySurface', () => ({
  SystemActivitySurface: () => <div data-testid="system-activity-stub" />,
}))
vi.mock('../../../panels/dashboard/widgets/SystemStatusWidget', () => ({
  SystemStatusWidget: () => <div data-testid="system-status-stub" />,
}))
vi.mock('../../../panels/dashboard/widgets/ProviderHealthWidget', () => ({
  ProviderHealthWidget: () => <div data-testid="provider-health-stub" />,
}))
vi.mock('../../../panels/dashboard/widgets/CostDashboardWidget', () => ({
  CostDashboardWidgetCore: () => <div data-testid="cost-dashboard-stub" />,
  CostDashboardWidget: () => <div data-testid="cost-dashboard-stub" />,
}))

let mockInvalidate = vi.fn(async () => {})
const mockGetSnapshotUseQuery = vi.fn<(input: unknown) => unknown>()
const happySnapshot = {
  backpressure: { state: 'nominal' as const, queueDepth: 0, activeAgents: 0 },
  cognitiveProfile: null,
  budget: { state: 'nominal' as const, spent: 0, ceiling: 10, period: '2026-04-01T00:00:00Z' },
  activeAgents: { count: 0, status: 'idle' as const },
}

vi.mock('@nous/transport', () => ({
  trpc: {
    health: {
      getStatusBarSnapshot: {
        useQuery: (input: unknown) => mockGetSnapshotUseQuery(input),
      },
    },
    projects: {
      get: {
        useQuery: () => ({ data: undefined }),
      },
    },
    useUtils: () => ({
      health: { getStatusBarSnapshot: { invalidate: mockInvalidate } },
    }),
  },
  useEventSubscription: () => {},
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

let container: HTMLDivElement
let root: Root

async function flush() {
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockInvalidate = vi.fn(async () => {})
  mockGetSnapshotUseQuery.mockReset()
  mockGetSnapshotUseQuery.mockReturnValue({ data: happySnapshot })
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await flush()
  })
  container.remove()
})

async function renderShell() {
  await act(async () => {
    root.render(
      <ShellProvider activeProjectId="proj-1" observePanelCollapsed={true}>
        <StatusBar />
        <ObservePanel />
      </ShellProvider>,
    )
    await flush()
  })
}

function clickIndicator(name: string) {
  const btn = container.querySelector(`[data-indicator="${name}"]`) as HTMLButtonElement
  return act(async () => {
    btn.click()
    await flush()
  })
}

function activeSlot(): string | null {
  const slots: HTMLElement[] = Array.from(container.querySelectorAll('[data-tab-slot]'))
  for (const s of slots) {
    if (s.style.display === 'flex') return s.getAttribute('data-tab-slot')
  }
  return null
}

/**
 * WR-162 SP 12 (SUPV-SP12-012) — End-to-end click-through tests.
 */
describe('Status-bar click-through (E2E)', () => {
  it('UT-SP12-E2E-CLICK-BACKPRESSURE-TO-SYSTEM-LOAD — backpressure click activates system-load tab', async () => {
    await renderShell()
    await clickIndicator('backpressure')
    expect(activeSlot()).toBe('system-load')
  })

  it('UT-SP12-E2E-CLICK-COGNITIVE-TO-COST-MONITOR — cognitive-profile click activates cost-monitor tab', async () => {
    await renderShell()
    await clickIndicator('cognitive-profile')
    expect(activeSlot()).toBe('cost-monitor')
  })

  it('UT-SP12-E2E-CLICK-BUDGET-TO-COST-MONITOR — budget click activates cost-monitor tab', async () => {
    await renderShell()
    await clickIndicator('budget')
    expect(activeSlot()).toBe('cost-monitor')
  })

  it('UT-SP12-E2E-CLICK-ACTIVE-AGENTS-TO-AGENTS — active-agents click activates agents tab', async () => {
    await renderShell()
    await clickIndicator('active-agents')
    expect(activeSlot()).toBe('agents')
  })
})
