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
      {currentIdentity ? (
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
        {ActiveRoute ? (
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
