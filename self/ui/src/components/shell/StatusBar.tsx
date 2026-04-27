'use client'

import type { CSSProperties } from 'react'
import { trpc, useEventSubscription } from '@nous/transport'
import type { EventChannel } from '@nous/shared'
import { useShellContext } from './ShellContext'
import { BackpressureIndicator } from './status-bar/BackpressureIndicator'
import { CognitiveProfileIndicator } from './status-bar/CognitiveProfileIndicator'
import { BudgetIndicator } from './status-bar/BudgetIndicator'
import { ActiveAgentsIndicator } from './status-bar/ActiveAgentsIndicator'

/**
 * WR-162 SP 12 (SUPV-SP12-006) — explicit 12-channel union per Decision #4.
 *
 * 11 base channels (per Decision #4) + `supervisor:sentinel-status`
 * (registered at SP 6). The `as const` form preserves the literal types
 * for type-narrowing; `useEventSubscription` accepts `C[] | string[]`
 * so we widen via a typed mutable copy for runtime.
 *
 * NO new SSE channel registered (Goals Constraint 3 + SC-24). Each
 * literal must exist in `EventChannelMap` keys at compile time
 * (verified via the typed declaration).
 */
export const STATUS_BAR_CHANNELS: ReadonlyArray<EventChannel> = [
  'health:backlog-analytics',
  'health:issue',
  'health:gateway-status',
  'mao:projection-changed',
  'mao:control-action',
  'app-health:change',
  'app-health:heartbeat',
  'cost:snapshot',
  'cost:budget-alert',
  'cost:budget-exceeded',
  'cost:event-recorded',
  'supervisor:sentinel-status',
]

/**
 * WR-162 SP 12 (SUPV-SP12-005 + SUPV-SP12-006) — observability status bar.
 *
 * Compact 16px strip; grid-external; mounted via `SimpleShellLayout.statusBar`
 * slot. Single tRPC query keyed on `['health.getStatusBarSnapshot', { projectId }]`
 * (one cache entry, one round-trip). 12-channel SSE subscription invokes
 * `utils.health.getStatusBarSnapshot.invalidate()` exactly once per event
 * (R-8 coarse invalidation).
 *
 * Layout order (SDS-named contract):
 *   Backpressure → CognitiveProfile → Budget → ActiveAgents.
 *
 * NOTE: `CognitiveProfileIndicator` does NOT consume `snapshot.cognitiveProfile`
 * (which is structurally null per Decision #7 Option D.2); it reads
 * `trpc.projects.get` internally (SUPV-SP12-007).
 *
 * `data-shell-component="observability-status-bar"` (NOT `"status-bar"`)
 * disambiguates from the legacy desktop developer-mode footer.
 */
export function StatusBar() {
  const { activeProjectId } = useShellContext()
  const utils = trpc.useUtils()
  const snapshotQuery = trpc.health.getStatusBarSnapshot.useQuery({
    projectId: activeProjectId ?? undefined,
  })

  // WR-162 SP 1.16 (SUPV-SP1.16-008) — RC-1b first-data gate. SSE events
  // delivered BEFORE the initial tRPC query resolves are absorbed by the
  // initial fetch itself; invalidating before first data multiplies the
  // hydration-window batch tick (BT R1 32× amplifier). The R-8 contract
  // ("one invalidate per change event in steady state") holds verbatim once
  // first data has arrived.
  useEventSubscription({
    channels: STATUS_BAR_CHANNELS as EventChannel[],
    onEvent: () => {
      if (snapshotQuery.data === undefined) return
      void utils.health.getStatusBarSnapshot.invalidate()
    },
  })

  const snapshot = snapshotQuery.data
  return (
    <div
      data-shell-component="observability-status-bar"
      role="status"
      aria-label="Observability status bar"
      style={containerStyle}
    >
      <BackpressureIndicator slot={snapshot?.backpressure ?? null} />
      <CognitiveProfileIndicator />
      <BudgetIndicator slot={snapshot?.budget ?? null} />
      <ActiveAgentsIndicator slot={snapshot?.activeAgents ?? null} />
    </div>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 'var(--nous-space-md)',
  height: '16px',
  minHeight: '16px',
  padding: '0 var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-muted)',
  background: 'var(--nous-bg-surface)',
  borderTop: '1px solid var(--nous-border-subtle)',
  userSelect: 'none',
  flexShrink: 0,
}
