import React from 'react'
import {
  HomeScreen,
  CatalogView,
  PlaceholderRoute,
  InboxView,
  ChatTabView,
  type ContentRouterRenderProps,
  type WorkspaceRouteIdentity,
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
  chat: ChatTabView,
  usage: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Usage" />,
  marketplace: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Marketplace" />,
}

export const BASE_SIMPLE_MODE_ROUTE_IDENTITIES: Record<string, Omit<WorkspaceRouteIdentity, 'params'>> = {
  home: { routeId: 'home', label: 'Workspace Home', surface: 'workspace' },
  threads: { routeId: 'threads', label: 'Threads', surface: 'workspace' },
  workflows: { routeId: 'workflows', label: 'Workflows', surface: 'project' },
  skills: { routeId: 'skills', label: 'Skills', surface: 'workspace' },
  apps: { routeId: 'apps', label: 'Apps', surface: 'workspace' },
  dashboard: { routeId: 'dashboard', label: 'Dashboard', surface: 'project' },
  'org-chart': { routeId: 'org-chart', label: 'Organization Chart', surface: 'project' },
  inbox: { routeId: 'inbox', label: 'Inbox', surface: 'project' },
  'workflow-detail': { routeId: 'workflow-detail', label: 'Workflow Detail', surface: 'project' },
  tasks: { routeId: 'tasks', label: 'Tasks', surface: 'project' },
  'task-detail': { routeId: 'task-detail', label: 'Task Detail', surface: 'project' },
  'task-create': { routeId: 'task-create', label: 'Create Task', surface: 'project' },
  agents: { routeId: 'agents', label: 'Agents', surface: 'project' },
  'agent-detail': { routeId: 'agent-detail', label: 'Agent Detail', surface: 'project' },
  chat: { routeId: 'chat', label: 'Chat', surface: 'chat' },
  usage: { routeId: 'usage', label: 'Usage', surface: 'workspace' },
  marketplace: { routeId: 'marketplace', label: 'Marketplace', surface: 'workspace' },
}
