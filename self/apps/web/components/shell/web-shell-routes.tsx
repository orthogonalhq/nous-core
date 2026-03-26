'use client'

import * as React from 'react'
import type { ComponentType } from 'react'
import {
  HomeScreen,
  CatalogView,
  type ContentRouterRenderProps,
  type CatalogItem,
} from '@nous/ui/components'
import { PreferencesPanel } from '@nous/ui/panels'
import { ChatApiAdapter } from './chat-api-adapter'
import { ConfigAdapter } from './adapters/config-adapter'
import { MemoryAdapter } from './adapters/memory-adapter'
import { MaoAdapter } from './adapters/mao-adapter'
import { TracesAdapter } from './adapters/traces-adapter'
import { MobileAdapter } from './adapters/mobile-adapter'

// ─── Stub data (matches desktop pattern) ────────────────────────────────────

const STUB_THREADS: CatalogItem[] = [
  { id: 'thread-1', title: 'Project Planning', description: 'Roadmap and milestone discussion', icon: 'T' },
  { id: 'thread-2', title: 'Architecture Review', description: 'System design feedback', icon: 'T' },
  { id: 'thread-3', title: 'Bug Triage', description: 'Issue prioritization session', icon: 'T' },
]

const STUB_WORKFLOWS: CatalogItem[] = [
  { id: 'wf-1', title: 'Code Review Pipeline', description: 'Automated review and gate checks', icon: 'W' },
  { id: 'wf-2', title: 'Deploy to Staging', description: 'Build, test, and deploy workflow', icon: 'W' },
  { id: 'wf-3', title: 'Daily Standup', description: 'Agent-assisted status aggregation', icon: 'W' },
]

const STUB_SKILLS: CatalogItem[] = [
  { id: 'skill-1', title: 'Code Generation', description: 'Generate code from natural language', icon: 'S' },
  { id: 'skill-2', title: 'Document Analysis', description: 'Extract insights from documents', icon: 'S' },
  { id: 'skill-3', title: 'Test Writing', description: 'Generate test suites from specifications', icon: 'S' },
]

// ─── Placeholder component factory ──────────────────────────────────────────

function createPlaceholder(label: string): ComponentType<ContentRouterRenderProps> {
  function PlaceholderRoute(_props: ContentRouterRenderProps) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-2xl)',
          color: 'var(--nous-text-secondary)',
          fontFamily: 'var(--nous-font-family)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 'var(--nous-font-size-lg)',
              fontWeight: 'var(--nous-font-weight-bold)',
              color: 'var(--nous-text-primary)',
              marginBottom: 'var(--nous-space-sm)',
            }}
          >
            {label}
          </h2>
          <p style={{ fontSize: 'var(--nous-font-size-sm)' }}>
            This view will be connected in a future phase.
          </p>
        </div>
      </div>
    )
  }
  PlaceholderRoute.displayName = `Placeholder(${label})`
  return PlaceholderRoute
}

// ─── Settings route wrapper (simplified, no Electron params) ────────────────

function SettingsRoute(_props: ContentRouterRenderProps) {
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
        params={{}}
      />
    </div>
  )
}

// ─── Route map ──────────────────────────────────────────────────────────────

export const webShellRoutes: Record<string, ComponentType<ContentRouterRenderProps>> = {
  home: HomeScreen,
  chat: ChatApiAdapter,
  projects: createPlaceholder('Projects'),
  marketplace: createPlaceholder('Marketplace'),
  traces: TracesAdapter,
  memory: MemoryAdapter,
  config: ConfigAdapter,
  settings: SettingsRoute,
  mao: MaoAdapter,
  mobile: MobileAdapter,
  threads: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_THREADS} />,
  workflows: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_WORKFLOWS} />,
  skills: (props: ContentRouterRenderProps) => <CatalogView {...props} items={STUB_SKILLS} />,
}
