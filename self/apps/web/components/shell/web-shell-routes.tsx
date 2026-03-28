'use client'

import * as React from 'react'
import type { ComponentType } from 'react'
import {
  HomeScreen,
  CatalogView,
  type ContentRouterRenderProps,
} from '@nous/ui/components'
import type { ShellMode } from '@nous/ui/components'
import { PreferencesPanel } from '@nous/ui/panels'
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

// ─── Route factory ─────────────────────────────────────────────────────────

export function createWebShellRoutes(params: {
  onModeChange?: (mode: ShellMode) => void
  currentMode?: ShellMode
}): Record<string, ComponentType<ContentRouterRenderProps>> {
  return {
    home: HomeScreen,
    settings: (_props: ContentRouterRenderProps) => (
      <SettingsRoute onModeChange={params.onModeChange} currentMode={params.currentMode} />
    ),
    threads: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_THREADS} />,
    workflows: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_WORKFLOWS} />,
    skills: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_SKILLS} />,
    apps: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_APPS} />,
  }
}
