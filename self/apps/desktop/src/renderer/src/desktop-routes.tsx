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

export const BASE_SIMPLE_MODE_ROUTES: Record<string, React.ComponentType<ContentRouterRenderProps>> = {
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
  'task-detail': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Task Detail" />,
  agents: (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agents" />,
  'agent-detail': (props: ContentRouterRenderProps) => <PlaceholderRoute {...props} label="Agent Detail" />,
}
