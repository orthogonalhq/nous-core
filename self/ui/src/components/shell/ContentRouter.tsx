'use client'

import * as React from 'react'
import { cn } from '../../lib/cn'

export interface ContentRouterRenderProps {
  navigate: (routeId: string) => void
  goBack: () => void
  canGoBack: boolean
}

export interface ContentRouterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  activeRoute: string
  routes: Record<string, React.ComponentType<ContentRouterRenderProps>>
  onNavigate?: (route: string) => void
}

export function ContentRouter({
  activeRoute,
  routes,
  onNavigate,
  className,
  style,
  ...props
}: ContentRouterProps) {
  const [stack, setStack] = React.useState<string[]>(activeRoute ? [activeRoute] : [])
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
  }, [activeRoute])

  const navigate = (routeId: string) => {
    if (!routes[routeId]) {
      return
    }

    const nextStack = [...stackRef.current, routeId]
    lastPropRouteRef.current = routeId
    stackRef.current = nextStack
    setStack(nextStack)
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

    if (nextRoute) {
      onNavigate?.(nextRoute)
    }
  }

  const currentRoute = stack[stack.length - 1] ?? ''
  const ActiveRoute = routes[currentRoute]
  const canGoBack = stack.length > 1

  return (
    <div
      className={cn('nous-content-router flex h-full min-w-0 flex-col', className)}
      style={{
        gap: 'var(--nous-space-sm)',
        ...style,
      }}
      {...props}
    >
      {canGoBack ? (
        <div
          className="flex items-center"
          style={{
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

      <div className="min-w-0 flex-1">
        {ActiveRoute ? (
          <ActiveRoute
            navigate={navigate}
            goBack={goBack}
            canGoBack={canGoBack}
          />
        ) : null}
      </div>
    </div>
  )
}
