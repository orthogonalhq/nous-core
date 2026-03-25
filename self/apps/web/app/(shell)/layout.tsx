'use client'

import * as React from 'react'
import { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ShellProvider,
  ShellLayout as UIShellLayout,
  NavigationRail,
  ContentRouter,
  ChatSurface,
  ObservePanel,
  CommandPalette,
} from '@nous/ui/components'
import type { ShellMode, NavigationState } from '@nous/ui/components'
import { WebChromeShell } from '@/components/shell/web-chrome-shell'
import { webRailSections } from '@/components/shell/web-rail-config'
import { webShellRoutes } from '@/components/shell/web-shell-routes'
import { buildWebCommands } from '@/components/shell/web-command-config'
import { trpc } from '@/lib/trpc'
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

  const searchParams = useSearchParams()
  const utils = trpc.useUtils()
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate()
    },
  })
  const { data: projectsData } = trpc.projects.list.useQuery()

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

  const handleNavigate = useCallback((routeId: string) => {
    setActiveRoute(routeId)
  }, [])

  const handleGoBack = useCallback(() => {
    setActiveRoute('home')
  }, [])

  const handleNewProject = useCallback(async () => {
    const name = prompt('Project name:')
    if (!name?.trim()) return
    try {
      const project = await createProject.mutateAsync({ name: name.trim() })
      setProjectId(project.id)
    } catch (err) {
      console.error(err)
      alert('Failed to create project')
    }
  }, [createProject])

  const handleProjectSelect = useCallback((id: string) => {
    if (id === 'new-project') {
      void handleNewProject()
    } else {
      setProjectId(id)
    }
  }, [handleNewProject])

  const navigation: NavigationState = useMemo(() => ({
    activeRoute,
    history: [activeRoute],
    canGoBack: activeRoute !== 'home',
  }), [activeRoute])

  const commands = useMemo(
    () => buildWebCommands({ navigate: handleNavigate, onModeToggle: handleModeToggle }),
    [handleNavigate, handleModeToggle],
  )

  const projects = useMemo(
    () => (projectsData ?? []).map((p) => ({ id: p.id, name: p.name })),
    [projectsData],
  )

  return (
    <WebChromeShell mode={mode} onModeToggle={handleModeToggle}>
      <ShellProvider
        mode={mode}
        activeRoute={activeRoute}
        navigation={navigation}
        navigate={handleNavigate}
        goBack={handleGoBack}
        activeProjectId={projectId}
      >
        <ProjectProvider value={{ projectId, setProjectId }}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
          {mode === 'simple' ? (
            <UIShellLayout
              rail={
                <NavigationRail
                  items={webRailSections}
                  activeItemId={activeRoute}
                  onItemSelect={handleNavigate}
                  projects={projects}
                  onProjectSelect={handleProjectSelect}
                />
              }
              chat={<ChatSurface />}
              content={
                <ContentRouter
                  activeRoute={activeRoute}
                  routes={webShellRoutes}
                  onNavigate={handleNavigate}
                />
              }
              observe={<ObservePanel />}
            />
          ) : (
            <WebDockviewShell />
          )}
          {children}
        </ProjectProvider>
      </ShellProvider>
    </WebChromeShell>
  )
}
