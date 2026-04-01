'use client'

import * as React from 'react'
import { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { DockviewApi } from 'dockview-react'
import {
  ShellProvider,
  ShellLayout as UIShellLayout,
  SimpleShellLayout,
  NavigationRail,
  ContentRouter,
  ObservePanel,
  CommandPalette,
  ProjectSwitcherRail,
  AssetSidebar,
  CollapsibleObserveEdge,
} from '@nous/ui/components'
import type { ShellMode, NavigationState, ChatStage } from '@nous/ui/components'
import { WebChromeShell } from '@/components/shell/web-chrome-shell'
import { webRailSections } from '@/components/shell/web-rail-config'
import { createWebShellRoutes } from '@/components/shell/web-shell-routes'
import { buildWebCommands } from '@/components/shell/web-command-config'
import { WEB_TOP_NAV, buildWebSidebarSections } from '@/components/shell/web-sidebar-config'
import { WebConnectedChatSurface } from '@/components/shell/web-chat-wrappers'
import { WEB_PANEL_DEFS } from '@/components/shell/web-panel-defs'
import { ProjectProvider } from '@/lib/project-context'

const WebDockviewShell = dynamic(
  () => import('@/components/shell/web-dockview-shell').then((mod) => ({ default: mod.WebDockviewShell })),
  { ssr: false },
)

const MODE_STORAGE_KEY = 'nous:shell-mode'

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={(
        <main
          style={{
            flex: '1 1 0%',
            overflow: 'auto',
          }}
        >
          {children}
        </main>
      )}
    >
      <ShellLayoutContent>{children}</ShellLayoutContent>
    </Suspense>
  )
}

function ShellLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const [mode, setMode] = useState<ShellMode>('simple')
  const [activeRoute, setActiveRoute] = useState('home')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null)
  const [observeWidth, setObserveWidth] = useState(20)

  const searchParams = useSearchParams()

  // Mode persistence — load on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(MODE_STORAGE_KEY)
      if (stored === 'simple' || stored === 'developer') {
        setMode(stored)
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [])

  // searchParams sync (carried from previous layout)
  useEffect(() => {
    const linkedProjectId = searchParams.get('projectId')
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId)
    }
  }, [projectId, searchParams])

  // Mode toggle handler
  const handleModeToggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'simple' ? 'developer' : 'simple'
      if (next === 'simple') setDockviewApi(null)
      try {
        localStorage.setItem(MODE_STORAGE_KEY, next)
      } catch {
        /* localStorage unavailable */
      }
      return next
    })
  }, [])

  // Keyboard shortcut: Ctrl+Shift+D — mode toggle
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        handleModeToggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleModeToggle])

  // Keyboard shortcut: Ctrl+K — command palette
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleProjectChange = useCallback((newProjectId: string) => {
    setProjectId(newProjectId)
    setActiveRoute('home') // reset content route on project switch
  }, [])

  const sidebarSections = useMemo(() => buildWebSidebarSections(), [])

  // Stub project list for the project rail (tRPC wiring in follow-up)
  const stubProjects = useMemo(() => [
    { id: 'project-1', name: 'Default Project' },
  ], [])

  const handleNavigate = useCallback((routeId: string) => {
    setActiveRoute(routeId)
  }, [])

  const handleGoBack = useCallback(() => {
    setActiveRoute('home')
  }, [])

  const navigation: NavigationState = useMemo(() => ({
    activeRoute,
    history: [activeRoute],
    canGoBack: activeRoute !== 'home',
  }), [activeRoute])

  const commands = useMemo(
    () => buildWebCommands({
      navigate: handleNavigate,
      onModeToggle: handleModeToggle,
      onCommandPalette: () => setCommandPaletteOpen((prev) => !prev),
    }),
    [handleNavigate, handleModeToggle],
  )

  const routes = useMemo(
    () => createWebShellRoutes({
      onModeChange: (newMode) => {
        setMode(newMode)
        try { localStorage.setItem(MODE_STORAGE_KEY, newMode) } catch { /* */ }
      },
      currentMode: mode,
    }),
    [mode],
  )

  return (
    <WebChromeShell mode={mode} onModeToggle={handleModeToggle} dockviewApi={dockviewApi} panelDefs={WEB_PANEL_DEFS}>
      <ShellProvider
        mode={mode}
        activeRoute={activeRoute}
        navigation={navigation}
        navigate={handleNavigate}
        goBack={handleGoBack}
        activeProjectId={projectId}
        onProjectChange={handleProjectChange}
      >
        <ProjectProvider value={{ projectId, setProjectId }}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
          <div style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden', position: 'relative' }}>
            {mode === 'simple' ? (
              <SimpleShellLayout
                projectRail={
                  <ProjectSwitcherRail
                    projects={stubProjects}
                    activeProjectId={projectId ?? 'project-1'}
                    onProjectSelect={handleProjectChange}
                  />
                }
                sidebar={
                  <AssetSidebar
                    projectName={stubProjects.find((p) => p.id === (projectId ?? 'project-1'))?.name ?? 'Project'}
                    topNav={WEB_TOP_NAV}
                    sections={sidebarSections}
                    activeRoute={activeRoute}
                    onNavigate={handleNavigate}
                    chatSlot={({ stage, onStageChange }: { stage: ChatStage; onStageChange: (s: ChatStage) => void }) => (
                      <WebConnectedChatSurface />
                    )}
                  />
                }
                content={
                  <ContentRouter
                    activeRoute={activeRoute}
                    routes={routes}
                    onNavigate={handleNavigate}
                  />
                }
                observe={
                  <CollapsibleObserveEdge
                    width={observeWidth}
                    onExpandToggle={() => setObserveWidth((w) => w < 60 ? 300 : 20)}
                  >
                    <ObservePanel />
                  </CollapsibleObserveEdge>
                }
                onColumnResize={(widths) => setObserveWidth(widths.observe)}
              />
            ) : (
              <WebDockviewShell onApiReady={setDockviewApi} />
            )}
          </div>
          {/* Next.js page outlet — hidden; shell uses ContentRouter for navigation */}
          <div style={{ display: 'none' }}>{children}</div>
        </ProjectProvider>
      </ShellProvider>
    </WebChromeShell>
  )
}
