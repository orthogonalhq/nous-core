'use client'

import { useState } from 'react'
import { SettingsNav } from './SettingsNav'
import type { SettingsCategory, SettingsShellProps } from './types'
import { PAGE_IDS } from './types'
import {
  AboutPage,
  ApiKeysPage,
  AppSettingsPage,
  ModelConfigPage,
  RoleAssignmentsPage,
  SetupWizardPage,
  ShellModePage,
  SystemStatusPage,
} from './pages'

const shellContainerStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  width: '100%',
  background: 'var(--nous-bg)',
  color: 'var(--nous-fg)',
}

const navColumnStyle: React.CSSProperties = {
  width: '200px',
  minWidth: '200px',
  borderRight: '1px solid var(--nous-header-border)',
  overflow: 'auto',
}

const contentColumnStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 'var(--nous-space-xl)',
}

function buildCategories(appPanels?: { id: string; title: string }[]): SettingsCategory[] {
  const categories: SettingsCategory[] = [
    {
      id: 'general',
      label: 'General',
      icon: null,
      defaultExpanded: true,
      children: [
        { id: PAGE_IDS.SHELL_MODE, label: 'Shell Mode' },
        { id: PAGE_IDS.ABOUT, label: 'About' },
      ],
    },
    {
      id: 'ai-configuration',
      label: 'AI Configuration',
      icon: null,
      defaultExpanded: true,
      children: [
        { id: PAGE_IDS.API_KEYS, label: 'API Keys' },
        { id: PAGE_IDS.MODEL_CONFIG, label: 'Model Config' },
        { id: PAGE_IDS.ROLE_ASSIGNMENTS, label: 'Role Assignments' },
      ],
    },
    {
      id: 'system',
      label: 'System',
      icon: null,
      defaultExpanded: true,
      children: [
        { id: PAGE_IDS.SYSTEM_STATUS, label: 'System Status' },
        { id: PAGE_IDS.SETUP_WIZARD, label: 'Setup Wizard' },
        { id: PAGE_IDS.LOCAL_MODELS, label: 'Local Models' },
      ],
    },
    {
      id: 'nous-apps',
      label: 'Nous Apps',
      icon: null,
      defaultExpanded: true,
      children: (appPanels ?? []).map((panel) => ({
        id: panel.id,
        label: panel.title,
      })),
    },
  ]

  return categories
}

export function SettingsShell({
  api,
  appPanels,
  defaultPageId,
  currentMode,
  onModeChange,
  onWizardReset,
  appSettingsContext,
}: SettingsShellProps) {
  const categories = buildCategories(appPanels)

  const firstPageId = categories[0]?.children?.[0]?.id ?? ''
  const [activePageId, setActivePageId] = useState<string>(defaultPageId ?? firstPageId)

  function renderPage() {
    if (!api) {
      // Pages that don't need the API can still render
      if (activePageId === PAGE_IDS.SHELL_MODE) {
        return <ShellModePage currentMode={currentMode ?? 'simple'} onModeChange={onModeChange} />
      }
      if (activePageId === PAGE_IDS.ABOUT) {
        return <AboutPage />
      }
      // For API-dependent pages, show the fallback
      return (
        <div style={{ color: 'var(--nous-fg-subtle)' }}>
          Settings API not connected.
        </div>
      )
    }

    switch (activePageId) {
      case PAGE_IDS.SHELL_MODE:
        return <ShellModePage currentMode={currentMode ?? 'simple'} onModeChange={onModeChange} />
      case PAGE_IDS.ABOUT:
        return <AboutPage />
      case PAGE_IDS.API_KEYS:
        return <ApiKeysPage api={api} />
      case PAGE_IDS.MODEL_CONFIG:
        return <ModelConfigPage api={api} />
      case PAGE_IDS.ROLE_ASSIGNMENTS:
        return <RoleAssignmentsPage api={api} />
      case PAGE_IDS.SYSTEM_STATUS:
        return <SystemStatusPage api={api} />
      case PAGE_IDS.SETUP_WIZARD:
        return <SetupWizardPage api={api} onWizardReset={onWizardReset} />
      default: {
        // Check if this is an app settings page
        const appContext = appSettingsContext?.[activePageId]
        if (appContext) {
          return <AppSettingsPage {...appContext} />
        }
        return (
          <div style={{ color: 'var(--nous-fg-subtle)' }}>
            Page not found: {activePageId}
          </div>
        )
      }
    }
  }

  return (
    <div style={shellContainerStyle} data-testid="settings-shell">
      <div style={navColumnStyle} data-testid="settings-nav-column">
        <SettingsNav
          categories={categories}
          activePageId={activePageId}
          onPageSelect={setActivePageId}
        />
      </div>
      <div style={contentColumnStyle} data-testid="settings-content">
        <div data-testid="settings-page-content">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
