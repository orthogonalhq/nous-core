import React from 'react'
import {
  HomeScreen,
  CatalogView,
  PlaceholderRoute,
  InboxView,
  type ContentRouterRenderProps,
} from '@nous/ui/components'
import {
  STUB_THREADS,
  STUB_WORKFLOWS,
  STUB_SKILLS,
  STUB_APPS,
} from '@nous/ui'
import { TaskDetailView, TaskCreateForm, WorkflowBuilderPanel } from '@nous/ui/panels'

// ─── Static route definitions ─────────────────────────────────────────────

export const BASE_SIMPLE_MODE_ROUTES: Record<string, React.ComponentType<ContentRouterRenderProps>> = {
  home: HomeScreen,
  threads: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_THREADS} />,
  workflows: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_WORKFLOWS} />,
  skills: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_SKILLS} />,
  apps: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_APPS} />,
  dashboard: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Dashboard" />,
  'org-chart': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Org Chart" />,
  inbox: InboxView as unknown as React.ComponentType<ContentRouterRenderProps>,
  'workflow-detail': WorkflowBuilderPanel as unknown as React.ComponentType<ContentRouterRenderProps>,
  tasks: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Tasks" />,
  'task-detail': TaskDetailView,
  'task-create': TaskCreateForm,
  agents: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agents" />,
  'agent-detail': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agent Detail" />,
  usage: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Usage" />,
  marketplace: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Marketplace" />,
}
