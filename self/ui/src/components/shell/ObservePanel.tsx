'use client'

import { clsx } from 'clsx'
import { useShellContext } from './ShellContext'
import { MaoPanel } from '../mao'
import { SystemActivitySurface } from './SystemActivitySurface'
import type { ObservePanelProps, ObserveRoute } from './types'

/** Map content routes to observe sub-panel routes */
const OBSERVE_ROUTE_MAP: Record<string, ObserveRoute> = {
  workflows: 'mao',
  'workflow-detail': 'mao',
  'system-activity': 'system-activity',
}

export function ObservePanel(props: ObservePanelProps) {
  const { activeRoute } = useShellContext()

  const observeRoute: ObserveRoute = OBSERVE_ROUTE_MAP[activeRoute] ?? 'default'

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
