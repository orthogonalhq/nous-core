'use client'

import * as React from 'react'
import { clsx } from 'clsx'

export interface ContentRouterRenderProps {
  navigate: (routeId: string, params?: Record<string, unknown>) => void
  goBack: () => void
  canGoBack: boolean
  params?: Record<string, unknown>
}

export interface ContentRouterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  activeRoute: string
  routes: Record<string, React.ComponentType<ContentRouterRenderProps>>
  onNavigate?: (route: string, params?: Record<string, unknown>) => void
  /** Params to pass to the component when navigation is driven by the activeRoute prop */
  navigationParams?: Record<string, unknown>
}

type StackEntry = { route: string; params?: Record<string, unknown> }

function stackEntryEquals(a: StackEntry, b: StackEntry): boolean {
  return a.route === b.route && JSON.stringify(a.params) === JSON.stringify(b.params)
}

export function ContentRouter({
  activeRoute,
  routes,
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

  return (
    <div
      className={clsx('nous-content-router', className)}
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
          />
        ) : null}
      </div>
    </div>
  )
}
