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
  ['28 min ago', 'Intake form cleaned up', 'Duplicate company fields were merged before the next send.'],
  ['34 min ago', 'Follow-up owner assigned', 'Andrew now owns the two high-touch plan follow-ups.'],
  ['42 min ago', 'Pricing question grouped', 'Six recent clients asked about implementation scope.'],
  ['51 min ago', 'Kickoff note prepared', 'Nue drafted the revised kickoff summary for review.'],
  ['1 hr ago', 'Approval queue refreshed', 'Three review items are ready in Client onboarding.'],
  ['1 hr ago', 'Plan snapshot saved', 'The revised onboarding plan is available for handoff.'],
]

function WorkspaceUpdatesRail() {
  return (
    <section data-reference-extraction="TOPO-07 DIM-04 DIM-15 STATE-13 STATE-14 TYPE-08" style={updatesRoot}>
      <header style={updatesHeader}>
        <h2 style={updatesTitle}>Workspace updates</h2>
        <div style={updatesControls} aria-label="Workspace update controls">
          <button type="button" aria-label="Filter workspace updates" style={updatesControlButton}>Filter</button>
          <button type="button" aria-label="Open workspace updates" style={updatesControlButton}>Open</button>
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

const updatesControlButton: CSSProperties = {
  height: 24,
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.035)',
  color: 'var(--nous-fg-subtle)',
  fontFamily: 'var(--nous-font-family-mono)',
  fontSize: 'var(--nous-type-micro-xs, 10px)',
  padding: '0 8px',
}

const updatesList: CSSProperties = {
  display: 'grid',
  gap: 10,
  paddingRight: 16,
}

const updateCard: CSSProperties = {
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--nous-workspace-card-bg)',
  border: '1px solid var(--nous-workspace-card-border)',
  boxShadow: 'var(--nous-workspace-card-shadow)',
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
  height: 36,
  background: 'var(--nous-workspace-updates-fade)',
  pointerEvents: 'none',
}
