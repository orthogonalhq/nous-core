'use client'

import { createContext, useContext, type PropsWithChildren } from 'react'
import {
  defaultConversationContext,
  type NavigationState,
  type ShellBreakpoint,
  type ShellContextValue,
  type ShellMode,
} from './types'

const DEFAULT_ACTIVE_ROUTE = 'home'

const DEFAULT_NAVIGATION: NavigationState = {
  activeRoute: DEFAULT_ACTIVE_ROUTE,
  history: [DEFAULT_ACTIVE_ROUTE],
  canGoBack: false,
}

function noop() {}

export interface ShellProviderProps extends PropsWithChildren {
  mode?: ShellMode
  breakpoint?: ShellBreakpoint
  activeRoute?: string
  navigationParams?: Record<string, unknown>
  navigation?: NavigationState
  conversation?: ShellContextValue['conversation']
  activeProjectId?: string | null
  navigate?: (routeId: string, params?: Record<string, unknown>) => void
  goBack?: () => void
  onProjectChange?: (projectId: string) => void
}

export const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({
  children,
  mode = 'simple',
  breakpoint = 'full',
  activeRoute = DEFAULT_ACTIVE_ROUTE,
  navigationParams,
  navigation,
  conversation = defaultConversationContext,
  activeProjectId = null,
  navigate = noop,
  goBack = noop,
  onProjectChange,
}: ShellProviderProps) {
  const resolvedActiveRoute = navigation?.activeRoute ?? activeRoute

  const value: ShellContextValue = {
    mode,
    breakpoint,
    activeRoute: resolvedActiveRoute,
    navigationParams,
    navigation: navigation ?? {
      ...DEFAULT_NAVIGATION,
      activeRoute: resolvedActiveRoute,
      history: [resolvedActiveRoute],
    },
    conversation,
    activeProjectId,
    navigate,
    goBack,
    onProjectChange,
  }

  return (
    <ShellContext.Provider value={value}>
      {children}
    </ShellContext.Provider>
  )
}

export function useShellContext(): ShellContextValue {
  const context = useContext(ShellContext)

  if (!context) {
    throw new Error('useShellContext must be used within ShellProvider')
  }

  return context
}

/**
 * Non-throwing variant of `useShellContext` — returns `null` when the hook
 * is invoked outside a `<ShellProvider>` subtree. Use this from modules that
 * may be rendered during Next.js static-prerender or other pre-mount paths
 * where the shell provider is not yet attached. For normal in-shell reads
 * prefer the strict `useShellContext`.
 */
export function useShellContextOptional(): ShellContextValue | null {
  return useContext(ShellContext)
}
