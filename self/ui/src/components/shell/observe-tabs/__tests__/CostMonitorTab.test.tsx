// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CostMonitorTab } from '../CostMonitorTab'

vi.mock('../../../../panels/dashboard/widgets/CostDashboardWidget', () => ({
  CostDashboardWidgetCore: () => <div data-testid="cost-dashboard-widget-core-stub" />,
}))

/**
 * WR-162 SP 12 (SUPV-SP12-004) — CostMonitorTab tests.
 */
describe('CostMonitorTab', () => {
  it('UT-SP12-TAB-COSTMONITOR-MOUNT — renders the extracted CostDashboardWidgetCore', () => {
    const { container } = render(<CostMonitorTab />)
    expect(container.querySelector('[data-testid="cost-dashboard-widget-core-stub"]')).toBeTruthy()
    expect(container.querySelector('[data-shell-component="cost-monitor-tab"]')).toBeTruthy()
  })
})
