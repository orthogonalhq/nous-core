'use client'

import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react'
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
  // --- WR-162 SP 11 (SUPV-SP11-003) — uncontrolled `useState` pattern ---
  // Host-provided values seed initial state on mount; host-provided setters
  // are forward-invoked alongside the internal setter so a host can observe
  // state changes without owning them.
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
  activeObserveTab: activeObserveTabProp,
  setActiveObserveTab: setActiveObserveTabProp,
  observePanelCollapsed: observePanelCollapsedProp,
  setObservePanelCollapsed: setObservePanelCollapsedProp,
}: ShellProviderProps) {
  const resolvedActiveRoute = navigation?.activeRoute ?? activeRoute

  // SP 11 SUPV-SP11-003 — runtime state wired here. Internal useState is the
  // canonical source; host-provided value props seed initial state on mount;
  // host-provided setter props are forward-invoked alongside the internal setter
  // so a host can observe state changes without owning them.
  const [activeObserveTabInternal, setActiveObserveTabInternal] =
    useState<ObserveTab>(activeObserveTabProp ?? 'agents')
  const [observePanelCollapsedInternal, setObservePanelCollapsedInternal] =
    useState<boolean>(observePanelCollapsedProp ?? false)

  // SUPV-SP1.17-005, SUPV-SP1.17-008 (preserves SP 11 SUPV-SP11-003 host-prop forwarding).
  const setActiveObserveTabResolved = useCallback((tab: ObserveTab) => {
    setActiveObserveTabInternal(tab)
    setActiveObserveTabProp?.(tab)
  }, [setActiveObserveTabProp])
  // SUPV-SP1.17-005, SUPV-SP1.17-008 (preserves SP 11 SUPV-SP11-003 host-prop forwarding).
  const setObservePanelCollapsedResolved = useCallback((v: boolean) => {
    setObservePanelCollapsedInternal(v)
    setObservePanelCollapsedProp?.(v)
  }, [setObservePanelCollapsedProp])

  // SUPV-SP1.17-004 — value identity stable when no observed input has changed; React.memo bypassed by context broadcast (SUPV-SP1.17-022); SDS phase-1.17 Mechanism Choice row RC-B3.
  const value = useMemo<ShellContextValue>(() => ({
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
    activeObserveTab: activeObserveTabInternal,
    setActiveObserveTab: setActiveObserveTabResolved,
    observePanelCollapsed: observePanelCollapsedInternal,
    setObservePanelCollapsed: setObservePanelCollapsedResolved,
  }), [
    mode,
    breakpoint,
    resolvedActiveRoute,
    navigationParams,
    navigation,
    conversation,
    activeProjectId,
    navigate,
    goBack,
    onProjectChange,
    activeObserveTabInternal,
    setActiveObserveTabResolved,
    observePanelCollapsedInternal,
    setObservePanelCollapsedResolved,
  ])

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
