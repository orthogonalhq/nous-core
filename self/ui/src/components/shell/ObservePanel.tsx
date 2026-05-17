'use client'

import type { CSSProperties } from 'react'
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
      {activeRoute === 'home' ? (
        <WorkspaceUpdatesRail />
      ) : observeRoute === 'mao' ? (
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

const updates = [
  ['2 min ago', 'Morning emails finished', 'Nue drafted three client replies and flagged one approval.'],
  ['8 min ago', 'Invoice draft created', 'A draft invoice is ready for Client onboarding.'],
  ['14 min ago', 'Content idea saved', 'Pulse captured a reusable onboarding FAQ.'],
  ['21 min ago', 'Schedule conflict spotted', 'Two kickoff windows overlap next Tuesday.'],
]

function WorkspaceUpdatesRail() {
  return (
    <section data-reference-extraction="TOPO-07 DIM-04 DIM-15 STATE-13 STATE-14 TYPE-08" style={updatesRoot}>
      <header style={updatesHeader}>
        <h2 style={updatesTitle}>Workspace updates</h2>
        <div style={updatesControls} aria-label="Workspace update controls">
          <span />
          <span />
        </div>
      </header>
      <div style={updatesList}>
        {updates.map(([time, title, body]) => (
          <article key={title} style={updateCard}>
            <div style={updateTime}>{time}</div>
            <div style={updateTitle}>{title}</div>
            <p style={updateBody}>{body}</p>
          </article>
        ))}
      </div>
      <div style={updatesFade} />
    </section>
  )
}

const updatesRoot: CSSProperties = {
  position: 'relative',
  height: '100%',
  minWidth: 0,
  overflow: 'hidden',
  padding: '10px 20px 0',
  background: 'var(--nous-workspace-updates-panel-bg)',
}

const updatesHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 32,
}

const updatesTitle: CSSProperties = {
  margin: 0,
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 600,
}

const updatesControls: CSSProperties = {
  display: 'flex',
  gap: 8,
}

const updatesList: CSSProperties = {
  display: 'grid',
  gap: 12,
  paddingRight: 16,
}

const updateCard: CSSProperties = {
  borderRadius: 10,
  padding: '12px 14px',
  background: 'rgba(255, 255, 255, 0.035)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
}

const updateTime: CSSProperties = {
  color: 'var(--nous-fg-subtle)',
  fontFamily: 'var(--nous-font-family-mono)',
  fontSize: 'var(--nous-type-micro-xs, 10px)',
}

const updateTitle: CSSProperties = {
  marginTop: 6,
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 600,
}

const updateBody: CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--nous-fg-muted)',
  fontSize: 'var(--nous-type-micro-sm, 11px)',
}

const updatesFade: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 72,
  background: 'var(--nous-workspace-updates-fade)',
  pointerEvents: 'none',
}
