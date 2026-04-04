'use client'

import * as React from 'react'
import type { ComponentType } from 'react'
import {
  HomeScreen,
  CatalogView,
  PlaceholderRoute,
  type ContentRouterRenderProps,
} from '@nous/ui/components'
import type { ShellMode } from '@nous/ui/components'
import { PreferencesPanel, TaskDetailView, TaskCreateForm } from '@nous/ui/panels'
import { STUB_THREADS, STUB_WORKFLOWS, STUB_SKILLS, STUB_APPS } from '@nous/ui'
import { usePreferencesApi } from '@nous/transport'

// ─── Settings route wrapper ────────────────────────────────────────────────

function SettingsRoute({ onModeChange, currentMode }: {
  onModeChange?: (mode: ShellMode) => void
  currentMode?: ShellMode
}) {
  const preferencesApi = usePreferencesApi()

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        background: 'var(--nous-content-bg)',
      }}
    >
      <PreferencesPanel
        api={{} as never}
        containerApi={{} as never}
        params={{ preferencesApi, onModeChange, currentMode }}
      />
    </div>
  )
}

// ─── Proxy-based route resolver for parameterized routes ──────────────────

const TASK_DETAIL_PREFIX = 'task-detail::'

function createRouteProxy(
  staticRoutes: Record<string, ComponentType<ContentRouterRenderProps>>,
): Record<string, ComponentType<ContentRouterRenderProps>> {
  return new Proxy(staticRoutes, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      // Handle task-detail::<taskId> pattern
      if (typeof prop === 'string' && prop.startsWith(TASK_DETAIL_PREFIX)) {
        const taskId = prop.slice(TASK_DETAIL_PREFIX.length)
        return (props: ContentRouterRenderProps) => (
          <TaskDetailView {...props} params={{ ...props.params, taskId }} />
        )
      }
      return undefined
    },
    has(target, prop: string) {
      if (prop in target) return true
      if (typeof prop === 'string' && prop.startsWith(TASK_DETAIL_PREFIX)) return true
      return false
    },
  })
}

// ─── Route factory ─────────────────────────────────────────────────────────

export function createWebShellRoutes(params: {
  onModeChange?: (mode: ShellMode) => void
  currentMode?: ShellMode
}): Record<string, ComponentType<ContentRouterRenderProps>> {
  const staticRoutes: Record<string, ComponentType<ContentRouterRenderProps>> = {
    home: HomeScreen,
    settings: (_props: ContentRouterRenderProps) => (
      <SettingsRoute onModeChange={params.onModeChange} currentMode={params.currentMode} />
    ),
    threads: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_THREADS} />,
    workflows: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_WORKFLOWS} />,
    skills: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_SKILLS} />,
    apps: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_APPS} />,
    dashboard: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Dashboard" />,
    'org-chart': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Org Chart" />,
    inbox: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Inbox" />,
    'workflow-detail': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Workflow Detail" />,
    tasks: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Tasks" />,
    'task-detail': TaskDetailView,
    'task-create': TaskCreateForm,
    agents: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agents" />,
    'agent-detail': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agent Detail" />,
  }

  return createRouteProxy(staticRoutes)
}

// Export for testing
export { createRouteProxy, TASK_DETAIL_PREFIX }
