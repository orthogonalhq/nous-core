'use client'

import { clsx } from 'clsx'
import { useShellContext } from './ShellContext'
import { MaoPanel } from '../mao'
import { SystemActivitySurface } from './SystemActivitySurface'
import type { ObservePanelProps } from './types'

/**
 * File-local observe-route union. WR-162 SP 2 removes `ObserveRoute` /
 * `OBSERVE_ROUTE_OVERRIDES` from `./types`. This panel keeps its existing
 * route-override behavior verbatim until SP 11 rewires the panel around
 * `ObserveTab`. Runtime behavior here is byte-identical to pre-SP-2.
 */
type LocalObserveRoute = 'mao' | 'default' | 'system-activity'

/** Routes that get special observe content (non-MAO). Everything else defaults to MAO. */
const OBSERVE_ROUTE_OVERRIDES: Record<string, LocalObserveRoute> = {
  home: 'default',
  'system-activity': 'system-activity',
}

export function ObservePanel(props: ObservePanelProps) {
  const { activeRoute } = useShellContext()

  const observeRoute: LocalObserveRoute = OBSERVE_ROUTE_OVERRIDES[activeRoute] ?? 'mao'

  return (
    <div
      className={clsx(props.className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--nous-fg)',
      }}
    >
      {observeRoute === 'mao' ? (
        <MaoPanel />
      ) : observeRoute === 'system-activity' ? (
        <SystemActivitySurface />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--nous-fg-subtle)',
            fontSize: 'var(--nous-font-size-sm)',
            padding: 'var(--nous-space-2xl)',
            textAlign: 'center',
          }}
        >
          No observe content for this view
        </div>
      )}
    </div>
  )
}
