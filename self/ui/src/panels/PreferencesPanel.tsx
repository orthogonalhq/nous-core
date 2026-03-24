'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { SettingsShell } from './settings/SettingsShell'
import type { ShellMode } from '../components/shell/types'
import type { AppPanelEntry } from './settings/types'

// ─── Re-exports (backward compatibility) ─────────────────────────────────────

export type {
  PreferencesApi,
  AvailableModel,
  ModelSelection,
  RoleAssignmentDisplayEntry,
} from './settings/types'

export { testStoredProviderKey, formatFeedbackError } from './settings/pages/helpers'

// ─── Props ───────────────────────────────────────────────────────────────────

interface PreferencesPanelProps extends IDockviewPanelProps {
  params: {
    preferencesApi?: import('./settings/types').PreferencesApi
    onWizardReset?: () => void | Promise<void>
    onModeChange?: (mode: ShellMode) => void
    currentMode?: ShellMode
    appPanels?: AppPanelEntry[]
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PreferencesPanel({ params }: PreferencesPanelProps) {
  return (
    <SettingsShell
      api={params?.preferencesApi}
      appPanels={params?.appPanels}
      currentMode={params?.currentMode}
      onModeChange={params?.onModeChange}
      onWizardReset={params?.onWizardReset}
    />
  )
}
