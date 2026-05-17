'use client'

import * as React from 'react'
import { clsx } from 'clsx'
import type { WorkspaceRouteIdentity } from './types'

export interface ContentRouterRenderProps {
  navigate: (routeId: string, params?: Record<string, unknown>) => void
  goBack: () => void
  canGoBack: boolean
  params?: Record<string, unknown>
  routeIdentity?: WorkspaceRouteIdentity
}

export interface ContentRouterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  activeRoute: string
  routes: Record<string, React.ComponentType<ContentRouterRenderProps>>
  routeIdentities?: Record<string, Omit<WorkspaceRouteIdentity, 'params'>>
  onNavigate?: (route: string, params?: Record<string, unknown>) => void
  /** Params to pass to the component when navigation is driven by the activeRoute prop */
  navigationParams?: Record<string, unknown>
}

type StackEntry = { route: string; params?: Record<string, unknown> }

function formatRouteParams(params?: Record<string, unknown>): string | null {
  if (!params) {
    return null
  }

  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .slice(0, 2)

  if (entries.length === 0) {
    return null
  }

  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' / ')
}

function stackEntryEquals(a: StackEntry, b: StackEntry): boolean {
  return a.route === b.route && JSON.stringify(a.params) === JSON.stringify(b.params)
}

export function ContentRouter({
  activeRoute,
  routes,
  routeIdentities,
  onNavigate,
  navigationParams: externalParams,
  className,
  style,
  ...props
}: ContentRouterProps) {
  const [stack, setStack] = React.useState<StackEntry[]>(activeRoute ? [{ route: activeRoute, params: externalParams }] : [])
  const [navigationParams, setNavigationParams] = React.useState<Record<string, unknown> | undefined>(externalParams)
  const stackRef = React.useRef(stack)
  const lastPropEntryRef = React.useRef<StackEntry>({ route: activeRoute, params: externalParams })

  React.useEffect(() => {
    stackRef.current = stack
  }, [stack])

  React.useEffect(() => {
    if (!activeRoute) return

    const incoming: StackEntry = { route: activeRoute, params: externalParams }

    // Same route + same params — no-op
    if (stackEntryEquals(incoming, lastPropEntryRef.current)) {
      return
    }

    const top = stackRef.current[stackRef.current.length - 1]
    const nextStack =
      top && stackEntryEquals(top, incoming)
        ? stackRef.current
        : [...stackRef.current, incoming]
    lastPropEntryRef.current = incoming
    stackRef.current = nextStack
    setStack(nextStack)
    setNavigationParams(externalParams)
  }, [activeRoute, externalParams])

  const navigate = (routeId: string, params?: Record<string, unknown>) => {
    if (!routes[routeId]) {
      return
    }

    const entry: StackEntry = { route: routeId, params }
    const nextStack = [...stackRef.current, entry]
    lastPropEntryRef.current = entry
    stackRef.current = nextStack
    setStack(nextStack)
    setNavigationParams(params)
    onNavigate?.(routeId)
  }

  const goBack = () => {
    if (stackRef.current.length <= 1) {
      return
    }

    const nextStack = stackRef.current.slice(0, -1)
    const previousEntry = nextStack[nextStack.length - 1]
    const nextRoute = previousEntry?.route ?? ''
    const restoredParams = previousEntry?.params
    lastPropEntryRef.current = previousEntry ?? { route: '' }
    stackRef.current = nextStack
    setStack(nextStack)
    setNavigationParams(restoredParams)

    if (nextRoute) {
      onNavigate?.(nextRoute, restoredParams)
    }
  }

  const currentRoute = stack[stack.length - 1]?.route ?? ''
  const ActiveRoute = routes[currentRoute]
  const canGoBack = stack.length > 1
  const currentIdentityTemplate = routeIdentities?.[currentRoute]
  const currentIdentity: WorkspaceRouteIdentity | undefined = currentIdentityTemplate
    ? { ...currentIdentityTemplate, params: navigationParams }
    : currentRoute
      ? {
          routeId: currentRoute,
          label: currentRoute,
          surface: currentRoute === 'chat' ? 'chat' : 'workspace',
          params: navigationParams,
        }
      : undefined
  const routeParamSummary = formatRouteParams(currentIdentity?.params)

  return (
    <div
      className={clsx('nous-content-router', className)}
      data-workspace-route-id={currentIdentity?.routeId}
      data-workspace-route-label={currentIdentity?.label}
      data-workspace-route-surface={currentIdentity?.surface}
      style={{
        display: 'flex',
        height: '100%',
        minWidth: 0,
        flexDirection: 'column',
        gap: 'var(--nous-space-sm)',
        ...style,
      }}
        {...props}
    >
      {currentIdentity && currentIdentity.routeId !== 'home' ? (
        <div
          data-workspace-route-identity="true"
          data-visual-shell-fidelity="route-identity"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--nous-space-sm)',
            minHeight: 'calc(var(--nous-workspace-route-header-height) + 10px)',
            margin: 'var(--nous-space-2xl) var(--nous-workspace-canvas-padding-x) var(--nous-space-md)',
            padding: 'var(--nous-space-md) var(--nous-space-lg)',
            border: '1px solid var(--nous-workspace-route-card-border)',
            borderRadius: 'var(--nous-radius-xl)',
            background: 'var(--nous-workspace-route-card-bg)',
            color: 'var(--nous-workspace-route-label-fg)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.035)',
          }}
        >
          <div style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 'var(--nous-space-xs)' }}>
            <span
              style={{
                fontSize: 'var(--nous-font-size-xl)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              {currentIdentity.label}
            </span>
            <span
              data-workspace-route-param-summary={routeParamSummary ?? undefined}
              style={{
                color: 'var(--nous-workspace-route-meta-fg)',
                fontFamily: 'var(--nous-font-family-mono)',
                fontSize: 'var(--nous-font-size-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {currentIdentity.routeId}{routeParamSummary ? ` / ${routeParamSummary}` : ''}
            </span>
          </div>
          <span
            data-workspace-route-surface-chip={currentIdentity.surface}
            style={{
              flexShrink: 0,
              borderRadius: '999px',
              background: 'var(--nous-workspace-route-chip-bg)',
              color: 'var(--nous-workspace-route-chip-fg)',
              fontFamily: 'var(--nous-font-family-mono)',
              fontSize: 'var(--nous-font-size-xs)',
              letterSpacing: '0.08em',
              padding: 'var(--nous-space-xs) var(--nous-space-md)',
              textTransform: 'uppercase',
            }}
          >
            {currentIdentity.surface}
          </span>
        </div>
      ) : null}

      {canGoBack ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 'var(--nous-space-sm)',
          }}
        >
          <button
            type="button"
            onClick={goBack}
            style={{
              border: '1px solid var(--nous-shell-column-border)',
              borderRadius: 'var(--nous-radius-md)',
              background: 'var(--nous-catalog-card-bg)',
              color: 'var(--nous-text-secondary)',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              cursor: 'pointer',
              transition: 'var(--nous-hover-button-transition)',
            }}
          >
            Back
          </button>
        </div>
      ) : null}

      <div
        style={{
          minWidth: 0,
          flex: '1 1 0%',
          overflowY: 'auto',
        }}
      >
        {currentIdentity?.routeId === 'home' ? (
          <ReferenceWorkspaceCanvas />
        ) : ActiveRoute ? (
          <ActiveRoute
            navigate={navigate}
            goBack={goBack}
            canGoBack={canGoBack}
            params={navigationParams}
            routeIdentity={currentIdentity}
          />
        ) : (
          <div
            role="status"
            data-workspace-route-missing="true"
            style={{
              padding: 'var(--nous-space-3xl)',
              color: 'var(--nous-text-secondary)',
            }}
          >
            Workspace route unavailable: {currentRoute || 'none'}
          </div>
        )}
      </div>
    </div>
  )
}

function ReferenceWorkspaceCanvas() {
  return (
    <div data-reference-extraction="TOPO-06 DIM-05 DIM-14 STATE-11 STATE-12 TYPE-06 TYPE-07" style={referenceCanvasRoot}>
      <div style={referenceContextBar}>
        <div style={{ fontWeight: 600 }}>Client onboarding</div>
        <div style={referenceSegmentedControl}>
          <span style={referenceSegmentMuted}>Pulse</span>
          <span style={referenceSegmentActive}>Workflow Editor</span>
        </div>
      </div>
      <section style={referenceHero}>
        <div>
          <h1 style={referenceHeroTitle}>Client onboarding</h1>
          <p style={referenceHeroSubtitle}>Automated client intake</p>
        </div>
        <div style={referenceStatusCluster}>
          <span style={referenceRunningPill}>Running</span>
          <span style={referenceMeta}>73 days of uptime</span>
          <span style={referenceMeta}>10 Agents</span>
        </div>
      </section>
      <section style={referenceDashboardGrid}>
        <ReferenceDashboardColumn
          title="Needs attention"
          accent="var(--nous-workspace-warning)"
          action="Review"
          items={[
            ['Review client intakes', '1 item needs approval'],
            ['Approve email drafts', '5 drafts waiting'],
            ['Follow-ups paused', '3 clients need owner input'],
          ]}
        />
        <ReferenceDashboardColumn
          title="Pulse insights"
          accent="var(--nous-workspace-info)"
          action="Review"
          items={[
            ['Scheduling is slowing onboarding', 'Calendar conflicts are up 18% this week'],
            ['Clients keep asking this', 'Pricing scope appears in 6 recent intakes'],
            ['Higher-touch plans convert faster', 'Guided kickoff improves close rate'],
          ]}
        />
      </section>
    </div>
  )
}

function ReferenceDashboardColumn({ title, items, accent, action }: { title: string; items: Array<[string, string]>; accent: string; action: string }) {
  return (
    <div style={referenceColumn}>
      <h2 style={referenceSectionTitle}>{title}</h2>
      {items.map(([itemTitle, body], index) => (
        <article key={itemTitle} style={referenceCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={referenceCardTitle}>{itemTitle}</div>
              <p style={referenceCardBody}>{body}</p>
            </div>
            {index === 0 ? <span style={{ ...referenceCount, borderColor: accent }}>{title === 'Needs attention' ? '1' : '3'}</span> : null}
          </div>
          <button type="button" style={{ ...referenceAction, color: accent }}>{action}</button>
        </article>
      ))}
    </div>
  )
}

const referenceCanvasRoot: React.CSSProperties = {
  minHeight: '100%',
  color: 'var(--nous-fg)',
}

const referenceContextBar: React.CSSProperties = {
  height: 'var(--nous-workspace-route-header-height)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  borderBottom: '1px solid var(--nous-workspace-shell-border)',
  fontSize: 'var(--nous-font-size-sm)',
}

const referenceSegmentedControl: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 2,
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.035)',
}

const referenceSegmentMuted: React.CSSProperties = {
  padding: '4px 8px',
  color: 'var(--nous-fg-subtle)',
  fontSize: 'var(--nous-font-size-xs)',
}

const referenceSegmentActive: React.CSSProperties = {
  ...referenceSegmentMuted,
  color: '#fff',
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.07)',
}

const referenceHero: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 32,
  padding: '36px 20px 56px 56px',
}

const referenceHeroTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--nous-type-page-title, 22px)',
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const referenceHeroSubtitle: React.CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--nous-fg-muted)',
  fontSize: 'var(--nous-font-size-sm)',
}

const referenceStatusCluster: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  paddingRight: 20,
}

const referenceRunningPill: React.CSSProperties = {
  borderRadius: 999,
  padding: '4px 8px',
  color: '#d8ffe8',
  background: 'rgba(35, 167, 104, 0.16)',
  border: '1px solid rgba(35, 167, 104, 0.32)',
  fontSize: 'var(--nous-font-size-xs)',
}

const referenceMeta: React.CSSProperties = {
  color: 'var(--nous-fg-subtle)',
  fontFamily: 'var(--nous-font-family-mono)',
  fontSize: 'var(--nous-type-meta, 12px)',
}

const referenceDashboardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  padding: '0 20px 36px 56px',
}

const referenceColumn: React.CSSProperties = {
  display: 'grid',
  gap: 12,
}

const referenceSectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--nous-type-section-title, 17px)',
  fontWeight: 600,
  letterSpacing: '-0.03em',
}

const referenceCard: React.CSSProperties = {
  borderRadius: 12,
  padding: '15px 21px 12px',
  background: 'var(--nous-workspace-card-bg)',
  border: '1px solid var(--nous-workspace-card-border)',
  boxShadow: 'var(--nous-workspace-card-shadow)',
}

const referenceCardTitle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 600,
}

const referenceCardBody: React.CSSProperties = {
  margin: '8px 0 0',
  color: 'var(--nous-fg-muted)',
  fontSize: 'var(--nous-font-size-xs)',
}

const referenceCount: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 999,
  border: '1px solid currentColor',
  fontFamily: 'var(--nous-font-family-mono)',
  fontSize: 'var(--nous-type-meta, 12px)',
}

const referenceAction: React.CSSProperties = {
  marginTop: 12,
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'var(--nous-font-family-mono)',
  fontSize: 'var(--nous-type-micro-xs, 10px)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}
