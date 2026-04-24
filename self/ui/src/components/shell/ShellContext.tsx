'use client'

import { createContext, useContext, type PropsWithChildren } from 'react'
import {
  defaultConversationContext,
  type NavigationState,
  type ObserveTab,
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
  // --- WR-162 SP 2 additions (contract-only; SP 11 wires useState) ---
  activeObserveTab?: ObserveTab
  setActiveObserveTab?: (tab: ObserveTab) => void
  observePanelCollapsed?: boolean
  setObservePanelCollapsed?: (v: boolean) => void
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
  activeObserveTab = 'agents',
  setActiveObserveTab = noop,
  observePanelCollapsed = false,
  setObservePanelCollapsed = noop,
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
    activeObserveTab,
    setActiveObserveTab,
    observePanelCollapsed,
    setObservePanelCollapsed,
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
