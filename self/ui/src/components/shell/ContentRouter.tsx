'use client'

import * as React from 'react'
import { clsx } from 'clsx'

export interface ContentRouterRenderProps {
  navigate: (routeId: string) => void
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

export function ContentRouter({
  activeRoute,
  routes,
  onNavigate,
  navigationParams: externalParams,
  className,
  style,
  ...props
}: ContentRouterProps) {
  const [stack, setStack] = React.useState<string[]>(activeRoute ? [activeRoute] : [])
  const [navigationParams, setNavigationParams] = React.useState<Record<string, unknown> | undefined>(undefined)
  const stackRef = React.useRef(stack)
  const lastPropRouteRef = React.useRef(activeRoute)

  React.useEffect(() => {
    stackRef.current = stack
  }, [stack])

  React.useEffect(() => {
    if (!activeRoute || activeRoute === lastPropRouteRef.current) {
      return
    }

    const nextStack =
      stackRef.current.at(-1) === activeRoute
        ? stackRef.current
        : [...stackRef.current, activeRoute]
    lastPropRouteRef.current = activeRoute
    stackRef.current = nextStack
    setStack(nextStack)
    setNavigationParams(externalParams)
  }, [activeRoute, externalParams])

  const navigate = (routeId: string, params?: Record<string, unknown>) => {
    if (!routes[routeId]) {
      return
    }

    const nextStack = [...stackRef.current, routeId]
    lastPropRouteRef.current = routeId
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
    const nextRoute = nextStack[nextStack.length - 1] ?? ''
    lastPropRouteRef.current = nextRoute
    stackRef.current = nextStack
    setStack(nextStack)
    setNavigationParams(undefined)

    if (nextRoute) {
      onNavigate?.(nextRoute)
    }
  }

  const currentRoute = stack[stack.length - 1] ?? ''
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
