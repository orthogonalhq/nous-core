import React from 'react'
import {
  HomeScreen,
  CatalogView,
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
}
