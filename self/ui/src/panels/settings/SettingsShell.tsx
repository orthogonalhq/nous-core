'use client'

import { useState } from 'react'
import { SettingsNav } from './SettingsNav'
import type { SettingsCategory, SettingsShellProps } from './types'
import { PAGE_IDS } from './types'

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

export function SettingsShell({ appPanels, defaultPageId }: SettingsShellProps) {
  const categories = buildCategories(appPanels)

  const firstPageId = categories[0]?.children?.[0]?.id ?? ''
  const [activePageId, setActivePageId] = useState<string>(defaultPageId ?? firstPageId)

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
        <div data-testid="settings-page-placeholder">
          {activePageId}
        </div>
      </div>
    </div>
  )
}
