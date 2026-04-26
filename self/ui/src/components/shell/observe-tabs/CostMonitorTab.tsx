'use client'

import { CostDashboardWidgetCore } from '../../../panels/dashboard/widgets/CostDashboardWidget'

/**
 * WR-162 SP 12 (SUPV-SP12-004) — Cost Monitor tab host.
 *
 * Renders the extracted `CostDashboardWidgetCore` (per SUPV-SP12-015).
 * Both this tab and the dockview `CostDashboardWidget` consume the same
 * core implementation per Decision #3 Consequences — one shared core,
 * two callers, no re-implementation.
 */
export function CostMonitorTab() {
  return (
    <div
      data-shell-component="cost-monitor-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <CostDashboardWidgetCore />
    </div>
  )
}
