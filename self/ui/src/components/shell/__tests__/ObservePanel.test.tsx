// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObservePanel } from '../ObservePanel'
import { ShellProvider } from '../ShellContext'

// SP 12 — mock the deep tab-host trees so the placeholder-swap regression
// suite can render real tab hosts shallowly without pulling in MAO + dashboard
// dependency graphs at unit-test scope.
vi.mock('../../mao/MaoPanel', () => ({
  MaoPanel: () => <div data-testid="agents-tab-real-content" />,
}))
vi.mock('../SystemActivitySurface', () => ({
  SystemActivitySurface: () => <div data-testid="system-activity-real-content" />,
}))
vi.mock('../../../panels/dashboard/widgets/SystemStatusWidget', () => ({
  SystemStatusWidget: () => <div data-testid="system-status-real-content" />,
}))
vi.mock('../../../panels/dashboard/widgets/ProviderHealthWidget', () => ({
  ProviderHealthWidget: () => <div data-testid="provider-health-real-content" />,
}))
vi.mock('../../../panels/dashboard/widgets/CostDashboardWidget', () => ({
  CostDashboardWidgetCore: () => <div data-testid="cost-dashboard-core-real-content" />,
  CostDashboardWidget: () => <div data-testid="cost-dashboard-core-real-content" />,
}))

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver

/**
 * WR-162 SP 11 — ObservePanel keep-mounted-hide-inactive contract.
 *
 * SUPV-SP11-001 (keep-mounted container) + SUPV-SP11-002 (closed-enum
 * three-button switcher) verified here. The panel renders three sibling
 * `<div data-tab-slot>` elements at all times; only the active slot has
 * `display: 'flex'`. The switcher renders three `<button role="tab">`
 * elements; clicking each updates `activeObserveTab` via shell context.
 */
describe('ObservePanel', () => {
  it('UT-SP11-OBSERVE-RENDER — renders three sibling tab slots + tablist + three role=tab buttons', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    // Three tab slots present in DOM regardless of active state
    expect(container.querySelector('[data-tab-slot="agents"]')).toBeTruthy()
    expect(container.querySelector('[data-tab-slot="system-load"]')).toBeTruthy()
    expect(container.querySelector('[data-tab-slot="cost-monitor"]')).toBeTruthy()
    // Tablist + three buttons
    expect(container.querySelector('[role="tablist"]')).toBeTruthy()
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3)
    expect(container.querySelector('[data-tab-id="agents"]')).toBeTruthy()
    expect(container.querySelector('[data-tab-id="system-load"]')).toBeTruthy()
    expect(container.querySelector('[data-tab-id="cost-monitor"]')).toBeTruthy()
  })

  it('UT-SP11-OBSERVE-AGENTS-ACTIVE — agents slot has display:flex; others have display:none', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="agents">
        <ObservePanel />
      </ShellProvider>,
    )
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    const systemLoad = container.querySelector('[data-tab-slot="system-load"]') as HTMLElement
    const costMonitor = container.querySelector('[data-tab-slot="cost-monitor"]') as HTMLElement
    expect(agents.style.display).toBe('flex')
    expect(systemLoad.style.display).toBe('none')
    expect(costMonitor.style.display).toBe('none')
  })

  it('UT-SP11-OBSERVE-SYSTEM-LOAD-ACTIVE — system-load slot has display:flex; others have display:none', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="system-load">
        <ObservePanel />
      </ShellProvider>,
    )
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    const systemLoad = container.querySelector('[data-tab-slot="system-load"]') as HTMLElement
    const costMonitor = container.querySelector('[data-tab-slot="cost-monitor"]') as HTMLElement
    expect(systemLoad.style.display).toBe('flex')
    expect(agents.style.display).toBe('none')
    expect(costMonitor.style.display).toBe('none')
  })

  it('UT-SP11-OBSERVE-COST-MONITOR-ACTIVE — cost-monitor slot has display:flex; others have display:none', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="cost-monitor">
        <ObservePanel />
      </ShellProvider>,
    )
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    const systemLoad = container.querySelector('[data-tab-slot="system-load"]') as HTMLElement
    const costMonitor = container.querySelector('[data-tab-slot="cost-monitor"]') as HTMLElement
    expect(costMonitor.style.display).toBe('flex')
    expect(agents.style.display).toBe('none')
    expect(systemLoad.style.display).toBe('none')
  })

  it('UT-SP11-OBSERVE-SWITCHER-AGENTS — clicking system-load button activates the system-load slot', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    const systemLoadBtn = container.querySelector('[data-tab-id="system-load"]') as HTMLButtonElement
    fireEvent.click(systemLoadBtn)
    const systemLoad = container.querySelector('[data-tab-slot="system-load"]') as HTMLElement
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    expect(systemLoad.style.display).toBe('flex')
    expect(agents.style.display).toBe('none')
  })

  it('UT-SP11-OBSERVE-SWITCHER-SYSTEM-LOAD — clicking cost-monitor button activates the cost-monitor slot', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    const costMonitorBtn = container.querySelector('[data-tab-id="cost-monitor"]') as HTMLButtonElement
    fireEvent.click(costMonitorBtn)
    const costMonitor = container.querySelector('[data-tab-slot="cost-monitor"]') as HTMLElement
    expect(costMonitor.style.display).toBe('flex')
  })

  it('UT-SP11-OBSERVE-SWITCHER-COST-MONITOR — clicking agents button activates the agents slot', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="cost-monitor">
        <ObservePanel />
      </ShellProvider>,
    )
    const agentsBtn = container.querySelector('[data-tab-id="agents"]') as HTMLButtonElement
    fireEvent.click(agentsBtn)
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    expect(agents.style.display).toBe('flex')
  })

  it('UT-SP11-OBSERVE-CLASSNAME — accepts className prop and applies it to wrapper', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel className="test-class" />
      </ShellProvider>,
    )
    const wrapper = container.querySelector('[data-shell-component="observe-panel"]') as HTMLElement
    expect(wrapper.className).toContain('test-class')
  })

  it('UT-SP11-OBSERVE-DELETION — no SP-2 placeholder text and no MAO Operating Surface render', () => {
    render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    // The SP 2 placeholder text is gone
    expect(screen.queryByText('No observe content for this view')).toBeNull()
    // MAO Operating Surface is no longer rendered (SP 12 wires real tab hosts later)
    expect(screen.queryByText('MAO Operating Surface')).toBeNull()
  })

  it('UT-SP11-OBSERVE-ARIA-SELECTED — only the active tab button has aria-selected="true"', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="system-load">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(
      container.querySelector('[data-tab-id="system-load"]')?.getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      container.querySelector('[data-tab-id="agents"]')?.getAttribute('aria-selected'),
    ).toBe('false')
    expect(
      container.querySelector('[data-tab-id="cost-monitor"]')?.getAttribute('aria-selected'),
    ).toBe('false')
  })

  it('UT-SP11-OBSERVE-DATA-ACTIVE — only the active tab button has data-active="true"', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="cost-monitor">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(
      container.querySelector('[data-tab-id="cost-monitor"]')?.getAttribute('data-active'),
    ).toBe('true')
    expect(
      container.querySelector('[data-tab-id="agents"]')?.getAttribute('data-active'),
    ).toBe('false')
    expect(
      container.querySelector('[data-tab-id="system-load"]')?.getAttribute('data-active'),
    ).toBe('false')
  })

  it('UT-SP11-OBSERVE-ARIA-HIDDEN — only the active tab slot has aria-hidden="false"', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="agents">
        <ObservePanel />
      </ShellProvider>,
    )
    expect(container.querySelector('[data-tab-slot="agents"]')?.getAttribute('aria-hidden')).toBe(
      'false',
    )
    expect(
      container.querySelector('[data-tab-slot="system-load"]')?.getAttribute('aria-hidden'),
    ).toBe('true')
    expect(
      container.querySelector('[data-tab-slot="cost-monitor"]')?.getAttribute('aria-hidden'),
    ).toBe('true')
  })

  it('UT-SP11-OBSERVE-TABLIST-LABEL — tablist has aria-label="Observe panel tabs"', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Observe panel tabs',
    )
  })

  it('UT-SP11-OBSERVE-TAB-LABELS — three buttons render the labels Agents / System Load / Cost Monitor', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    expect(container.querySelector('[data-tab-id="agents"]')?.textContent).toBe('Agents')
    expect(container.querySelector('[data-tab-id="system-load"]')?.textContent).toBe('System Load')
    expect(container.querySelector('[data-tab-id="cost-monitor"]')?.textContent).toBe(
      'Cost Monitor',
    )
  })

  it('UT-SP11-OBSERVE-DEFAULT-TAB — default activeObserveTab is "agents" without an explicit prop', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    const agents = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    expect(agents.style.display).toBe('flex')
    expect(
      container.querySelector('[data-tab-id="agents"]')?.getAttribute('aria-selected'),
    ).toBe('true')
  })

  // ── SP 12 (SUPV-SP12-001) — placeholder swap regression cases ──────────────
  it('UT-SP12-OBSERVE-REAL-TAB-AGENTS — agents slot renders the real AgentsTab content (not a null placeholder)', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="agents">
        <ObservePanel />
      </ShellProvider>,
    )
    const slot = container.querySelector('[data-tab-slot="agents"]') as HTMLElement
    expect(slot.querySelector('[data-testid="agents-tab-real-content"]')).toBeTruthy()
  })

  it('UT-SP12-OBSERVE-REAL-TAB-SYSTEM-LOAD — system-load slot renders the real SystemLoadTab content', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="system-load">
        <ObservePanel />
      </ShellProvider>,
    )
    const slot = container.querySelector('[data-tab-slot="system-load"]') as HTMLElement
    expect(slot.querySelector('[data-shell-component="system-load-tab"]')).toBeTruthy()
    expect(slot.querySelector('[data-testid="system-activity-real-content"]')).toBeTruthy()
  })

  it('UT-SP12-OBSERVE-REAL-TAB-COST-MONITOR — cost-monitor slot renders the real CostMonitorTab content', () => {
    const { container } = render(
      <ShellProvider activeObserveTab="cost-monitor">
        <ObservePanel />
      </ShellProvider>,
    )
    const slot = container.querySelector('[data-tab-slot="cost-monitor"]') as HTMLElement
    expect(slot.querySelector('[data-shell-component="cost-monitor-tab"]')).toBeTruthy()
    expect(slot.querySelector('[data-testid="cost-dashboard-core-real-content"]')).toBeTruthy()
  })

  it('UT-SP12-OBSERVE-CONTAINER-SHAPE — three sibling tabpanels + tablist + three tabs (regression guard)', () => {
    const { container } = render(
      <ShellProvider>
        <ObservePanel />
      </ShellProvider>,
    )
    expect(container.querySelectorAll('[role="tabpanel"]').length).toBe(3)
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3)
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Observe panel tabs',
    )
  })
})
