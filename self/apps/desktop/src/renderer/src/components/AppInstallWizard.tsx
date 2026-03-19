'use client'

import { useState } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import type {
  AppInstallPreparation,
  AppInstallRequest,
  AppInstallResult,
} from '@nous/shared'
import { Button, Input, InstallWizard } from '@nous/ui'

interface DesktopInstallApi {
  prepare: (request: {
    project_id: string
    package_id: string
    release_id?: string
  }) => Promise<AppInstallPreparation>
  install: (request: AppInstallRequest) => Promise<AppInstallResult>
}

interface AppInstallWizardPanelProps extends IDockviewPanelProps {
  params: {
    appInstallApi?: DesktopInstallApi
  }
}

export function AppInstallWizardPanel({ params }: AppInstallWizardPanelProps) {
  const appInstallApi = params.appInstallApi
  const [projectId, setProjectId] = useState('')
  const [packageId, setPackageId] = useState('telegram-connector')
  const [preparation, setPreparation] = useState<AppInstallPreparation | null>(null)
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
            Load the canonical install contract from the web backend, then run
            the shared approval-gated wizard inside the desktop host.
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
        <InstallWizard
          preparation={preparation}
          projectId={projectId}
          actorId="desktop-installer"
          onInstall={(request) => appInstallApi!.install(request)}
          disabled={!appInstallApi}
          disabledReason="Desktop install proxy is unavailable."
        />
      ) : null}
    </div>
  )
}
