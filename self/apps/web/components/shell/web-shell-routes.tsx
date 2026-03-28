'use client'

import * as React from 'react'
import type { ComponentType } from 'react'
import {
  HomeScreen,
  CatalogView,
  type ContentRouterRenderProps,
} from '@nous/ui/components'
import { PreferencesPanel } from '@nous/ui/panels'
import { STUB_THREADS, STUB_WORKFLOWS, STUB_SKILLS, STUB_APPS } from '@nous/ui'
import { usePreferencesApi } from '@nous/transport'

// ─── Settings route wrapper (simplified, no Electron params) ────────────────

function SettingsRoute(_props: ContentRouterRenderProps) {
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
        params={{ preferencesApi }}
      />
    </div>
  )
}

// ─── Route map ──────────────────────────────────────────────────────────────

export const webShellRoutes: Record<string, ComponentType<ContentRouterRenderProps>> = {
  home: HomeScreen,
  settings: SettingsRoute,
  threads: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_THREADS} />,
  workflows: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_WORKFLOWS} />,
  skills: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_SKILLS} />,
  apps: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_APPS} />,
}
