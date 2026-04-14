'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { PreferencesPanel } from '@nous/ui/panels'
import { usePreferencesApi } from '@nous/transport'

type PreferencesPanelParams = Parameters<typeof PreferencesPanel>[0]['params']

/**
 * Dockview-hosted PreferencesPanel with live tRPC API wiring.
 * Calls usePreferencesApi() (which requires TransportProvider context)
 * and merges the result into PreferencesPanel params.
 */
export function WebConnectedPreferencesPanel(props: IDockviewPanelProps<PreferencesPanelParams>) {
  const preferencesApi = usePreferencesApi()

  return (
    <PreferencesPanel
      {...props}
      params={{ ...props.params, preferencesApi }}
    />
  )
}
