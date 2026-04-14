'use client'

import type { AppSettingsPageProps } from '../types'
import { AppSettingsSurface } from '../../../settings/AppSettingsSurface'

export type { AppSettingsPageProps }

export function AppSettingsPage({ preparation, actorId, onSave, evidenceRefs }: AppSettingsPageProps) {
  return (
    <div data-testid="settings-page-app-settings">
      <AppSettingsSurface
        preparation={preparation}
        actorId={actorId}
        onSave={onSave}
        evidenceRefs={evidenceRefs}
      />
    </div>
  )
}
