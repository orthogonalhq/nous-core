'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { SystemActivitySurface } from '../SystemActivitySurface'
import { SystemStatusWidget } from '../../../panels/dashboard/widgets/SystemStatusWidget'
import { ProviderHealthWidget } from '../../../panels/dashboard/widgets/ProviderHealthWidget'

/**
 * WR-162 SP 12 (SUPV-SP12-003) — System Load tab host.
 *
 * Composes the three observe-child widgets per Decision #3 absorption:
 *   - `SystemActivitySurface` — wraps `SystemActivityPanel` with
 *     `hostingContext="observe-child"`. The standalone
 *     `SystemActivityPanel` route page is preserved (Decision #3) —
 *     this is duplication at the tab level, not relocation.
 *   - `SystemStatusWidget` + `ProviderHealthWidget` — existing dashboard
 *     widgets. They accept an `IDockviewPanelProps` arg whose body is
 *     unused (underscore-prefix); a minimal stub is passed for TS
 *     exhaustiveness.
 */
const dockviewStub = {} as IDockviewPanelProps

export function SystemLoadTab() {
  return (
    <div
      data-shell-component="system-load-tab"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--nous-space-md)',
        height: '100%',
        overflow: 'auto',
        padding: 'var(--nous-space-md)',
      }}
    >
      <SystemActivitySurface />
      <SystemStatusWidget {...dockviewStub} />
      <ProviderHealthWidget {...dockviewStub} />
    </div>
  )
}
