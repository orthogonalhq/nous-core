'use client'

import { clsx } from 'clsx'
import { useShellContext } from './ShellContext'
import { MaoPanel } from '../mao'
import { SystemActivitySurface } from './SystemActivitySurface'
import type { ObservePanelProps, ObserveRoute } from './types'

/** Routes that get special observe content (non-MAO). Everything else defaults to MAO. */
const OBSERVE_ROUTE_OVERRIDES: Record<string, ObserveRoute> = {
  home: 'default',
  'system-activity': 'system-activity',
}

export function ObservePanel(props: ObservePanelProps) {
  const { activeRoute } = useShellContext()

  const observeRoute: ObserveRoute = OBSERVE_ROUTE_OVERRIDES[activeRoute] ?? 'mao'

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
