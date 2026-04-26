'use client'

import { clsx } from 'clsx'
import { useShellContext } from './ShellContext'
import type { ObservePanelProps, ObserveTab } from './types'
import { AgentsTab } from './observe-tabs/AgentsTab'
import { SystemLoadTab } from './observe-tabs/SystemLoadTab'
import { CostMonitorTab } from './observe-tabs/CostMonitorTab'

/**
 * WR-162 SP 11 (SUPV-SP11-001 + SUPV-SP11-002 + SUPV-SP11-007) —
 * keep-mounted-hide-inactive observe panel. Three sibling tab slots exist
 * in the DOM at all times; inactive slots use `display: none`. SP 12
 * (SUPV-SP12-001) wires real tab hosts in place of the SP 11 `null`-
 * returning placeholders. Container shape (tablist + three `<div
 * role="tabpanel">` siblings + `display: flex|none` toggle + every aria
 * attribute) is UNCHANGED from SP 11.
 *
 * The previous SP 2 route-conditional dispatch and `OBSERVE_ROUTE_OVERRIDES`
 * map are removed (Goals SC-2). The panel no longer reads `activeRoute`.
 */
const TABS: ReadonlyArray<{ id: ObserveTab; label: string }> = [
  { id: 'agents', label: 'Agents' },
  { id: 'system-load', label: 'System Load' },
  { id: 'cost-monitor', label: 'Cost Monitor' },
]

export function ObservePanel(props: ObservePanelProps) {
  const { activeObserveTab, setActiveObserveTab } = useShellContext()
  return (
    <div
      className={clsx(props.className)}
      data-shell-component="observe-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--nous-fg)',
      }}
    >
      <div
        role="tablist"
        aria-label="Observe panel tabs"
        data-shell-component="observe-tab-switcher"
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 'var(--nous-space-xs)',
          padding: 'var(--nous-space-sm)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeObserveTab === tab.id}
            data-tab-id={tab.id}
            data-active={activeObserveTab === tab.id ? 'true' : 'false'}
            onClick={() => setActiveObserveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        data-tab-slot="agents"
        aria-hidden={activeObserveTab !== 'agents'}
        style={{ display: activeObserveTab === 'agents' ? 'flex' : 'none', height: '100%' }}
      >
        <AgentsTab />
      </div>
      <div
        role="tabpanel"
        data-tab-slot="system-load"
        aria-hidden={activeObserveTab !== 'system-load'}
        style={{ display: activeObserveTab === 'system-load' ? 'flex' : 'none', height: '100%' }}
      >
        <SystemLoadTab />
      </div>
      <div
        role="tabpanel"
        data-tab-slot="cost-monitor"
        aria-hidden={activeObserveTab !== 'cost-monitor'}
        style={{ display: activeObserveTab === 'cost-monitor' ? 'flex' : 'none', height: '100%' }}
      >
        <CostMonitorTab />
      </div>
    </div>
  )
}
