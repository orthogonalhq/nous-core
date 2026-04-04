import React from 'react'
import {
  HomeScreen,
  CatalogView,
  PlaceholderRoute,
  type ContentRouterRenderProps,
} from '@nous/ui/components'
import {
  STUB_THREADS,
  STUB_WORKFLOWS,
  STUB_SKILLS,
  STUB_APPS,
} from '@nous/ui'
import { TaskDetailView, TaskCreateForm } from '@nous/ui/panels'

// ─── Proxy-based route resolver for parameterized routes ──────────────────

const TASK_DETAIL_PREFIX = 'task-detail::'

function createRouteProxy(
  staticRoutes: Record<string, React.ComponentType<ContentRouterRenderProps>>,
): Record<string, React.ComponentType<ContentRouterRenderProps>> {
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

// ─── Static route definitions ─────────────────────────────────────────────

const STATIC_ROUTES: Record<string, React.ComponentType<ContentRouterRenderProps>> = {
  home: HomeScreen,
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

export const BASE_SIMPLE_MODE_ROUTES = createRouteProxy(STATIC_ROUTES)
