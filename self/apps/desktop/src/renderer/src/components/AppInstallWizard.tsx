'use client'

import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type {
  AppInstallPreparation,
  AppInstallRequest,
  AppInstallResult,
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
} from '@nous/shared'
import { AppSettingsSurface, Button, Input, InstallWizard } from '@nous/ui'

interface DesktopInstallApi {
  prepare: (request: {
    project_id: string
    package_id: string
    release_id?: string
  }) => Promise<AppInstallPreparation>
  install: (request: AppInstallRequest) => Promise<AppInstallResult>
}

interface DesktopSettingsApi {
  prepare: (request: {
    project_id: string
    package_id: string
  }) => Promise<AppSettingsPreparation>
  save: (request: AppSettingsSaveRequest) => Promise<AppSettingsSaveResult>
}

interface AppInstallWizardPanelProps extends IDockviewPanelProps {
  params: {
    appInstallApi?: DesktopInstallApi
    appSettingsApi?: DesktopSettingsApi
  }
}

export function AppInstallWizardPanel({ params }: AppInstallWizardPanelProps) {
  const appInstallApi = params.appInstallApi
  const appSettingsApi = params.appSettingsApi
  const [projectId, setProjectId] = useState('')
  const [packageId, setPackageId] = useState('telegram-connector')
  const [preparation, setPreparation] = useState<AppInstallPreparation | null>(null)
  const [settingsPreparation, setSettingsPreparation] = useState<AppSettingsPreparation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prepare = async () => {
    if (!appInstallApi || !projectId.trim() || !packageId.trim()) return
    setLoading(true)
    setError(null)
    try {
      const next = await appInstallApi.prepare({
        project_id: projectId.trim(),
        package_id: packageId.trim(),
      })
      setPreparation(next)
      try {
        if (appSettingsApi) {
          setSettingsPreparation(
            await appSettingsApi.prepare({
              project_id: projectId.trim(),
              package_id: packageId.trim(),
            }),
          )
        }
      } catch {
        setSettingsPreparation(null)
      }
    } catch (prepareError) {
      setPreparation(null)
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : 'Could not prepare the install wizard.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4 text-foreground">
      <div className="space-y-3 rounded-lg border border-border bg-background/70 p-4">
        <div>
          <h3 className="text-base font-semibold">Desktop App Installer</h3>
          <p className="text-sm text-muted-foreground">
            Load the canonical install or settings contract from the web
            backend, then run the shared host-owned surface inside the desktop
            shell.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>Project Id</span>
            <Input
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Package Id</span>
            <Input
              value={packageId}
              onChange={(event) => setPackageId(event.target.value)}
              placeholder="telegram-connector"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <Button onClick={prepare} disabled={!appInstallApi || loading}>
            {loading ? 'Preparing...' : 'Load Install Wizard'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {preparation ? (
        settingsPreparation ? (
          <AppSettingsSurface
            preparation={settingsPreparation}
            actorId="desktop-installer"
            onSave={(request) => appSettingsApi!.save(request)}
            disabled={!appSettingsApi}
            disabledReason="Desktop settings proxy is unavailable."
            onSaved={async () => {
              if (!appSettingsApi) return
              const refreshed = await appSettingsApi.prepare({
                project_id: projectId,
                package_id: packageId,
              })
              setSettingsPreparation(refreshed)
              window.dispatchEvent(
                new CustomEvent('nous:app-settings-changed', {
                  detail: {
                    appId: refreshed.app_id,
                    configVersion: refreshed.config_version,
                    configSnapshot: refreshed.panel_config_snapshot,
                  },
                }),
              )
            }}
          />
        ) : (
          <InstallWizard
            preparation={preparation}
            projectId={projectId}
            actorId="desktop-installer"
            onInstall={(request) => appInstallApi!.install(request)}
            onResult={async (result) => {
              if (!appSettingsApi || result.status === 'failed') {
                return
              }
              const refreshed = await appSettingsApi.prepare({
                project_id: projectId,
                package_id: packageId,
              })
              setSettingsPreparation(refreshed)
              window.dispatchEvent(
                new CustomEvent('nous:app-settings-changed', {
                  detail: {
                    appId: refreshed.app_id,
                    configVersion: refreshed.config_version,
                    configSnapshot: refreshed.panel_config_snapshot,
                  },
                }),
              )
            }}
            disabled={!appInstallApi}
            disabledReason="Desktop install proxy is unavailable."
          />
        )
      ) : null}
    </div>
  )
}
