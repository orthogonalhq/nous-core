// @vitest-environment jsdom

import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SystemLoadTab } from '../SystemLoadTab'

vi.mock('../../SystemActivitySurface', () => ({
  SystemActivitySurface: () => <div data-testid="system-activity-surface-stub" />,
}))
vi.mock('../../../../panels/dashboard/widgets/SystemStatusWidget', () => ({
  SystemStatusWidget: () => <div data-testid="system-status-widget-stub" />,
}))
vi.mock('../../../../panels/dashboard/widgets/ProviderHealthWidget', () => ({
  ProviderHealthWidget: () => <div data-testid="provider-health-widget-stub" />,
}))

/**
 * WR-162 SP 12 (SUPV-SP12-003) — SystemLoadTab tests.
 */
describe('SystemLoadTab', () => {
  it('UT-SP12-TAB-SYSTEMLOAD-MOUNT — renders all three composed widgets', () => {
    const { container } = render(<SystemLoadTab />)
    expect(container.querySelector('[data-testid="system-activity-surface-stub"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="system-status-widget-stub"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="provider-health-widget-stub"]')).toBeTruthy()
    expect(container.querySelector('[data-shell-component="system-load-tab"]')).toBeTruthy()
  })
})
