import { useEffect, useRef, useState } from 'react'
import {
  formatLifecycleState,
  type FirstRunState,
  type OllamaStatus,
  type WizardStepProps,
} from './types'
import { trpcMutate } from './trpc-fetch'

export interface WizardStepOllamaSetupProps extends WizardStepProps {
  ollamaStatus: OllamaStatus | null
  refreshOllamaStatus: () => Promise<void>
}

function formatInstallPhase(phase: string): string {
  switch (phase) {
    case 'checking':
      return 'Checking package manager...'
    case 'downloading':
      return 'Downloading Ollama...'
    case 'installing':
      return 'Installing Ollama...'
    case 'verifying':
      return 'Verifying installation...'
    default:
      return `${phase}...`
  }
}

function getStatusTone(state: OllamaStatus['state'] | null): string {
  switch (state) {
    case 'running':
      return 'nous-wizard__status nous-wizard__status--running'
    case 'starting':
    case 'stopping':
      return 'nous-wizard__status nous-wizard__status--action'
    case 'error':
      return 'nous-wizard__status nous-wizard__status--error'
    default:
      return 'nous-wizard__status nous-wizard__status--warning'
  }
}

export function WizardStepOllamaSetup({
  ollamaStatus,
  actionInProgress,
  setActionError,
  setActionInProgress,
  onStepComplete,
  refreshOllamaStatus,
}: WizardStepOllamaSetupProps) {
  const state = ollamaStatus?.state ?? null
  const canContinue = state === 'running'

  const [installPhase, setInstallPhase] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installElevationError, setInstallElevationError] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Cleanup progress listener on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const handleInstall = async () => {
    setInstallError(null)
    setInstallElevationError(false)
    setActionError(null)
    setActionInProgress(true)

    // Subscribe to progress events
    const unsubscribe = window.electronAPI.ollama.onInstallProgress((progress) => {
      setInstallPhase(progress.phase)
    })
    cleanupRef.current = unsubscribe

    try {
      const result = (await window.electronAPI.ollama.install()) as {
        success: boolean
        error?: string
        elevationError?: boolean
        packageManagerMissing?: boolean
      }

      if (result.success) {
        setInstallPhase(null)
        await refreshOllamaStatus()
      } else if (result.elevationError) {
        setInstallPhase(null)
        setInstallElevationError(true)
        setInstallError(result.error ?? 'Installation requires elevated permissions.')
      } else {
        setInstallPhase(null)
        setInstallError(result.error ?? 'Installation failed.')
      }
    } catch (error) {
      setInstallPhase(null)
      const message = error instanceof Error ? error.message : String(error)
      setInstallError(message)
    } finally {
      unsubscribe()
      cleanupRef.current = null
      setActionInProgress(false)
    }
  }

  const handleRefresh = async () => {
    setActionError(null)
    setActionInProgress(true)
    try {
      await refreshOllamaStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleStart = async () => {
    setActionError(null)
    setActionInProgress(true)
    try {
      const result = await window.electronAPI.ollama.start()
      if (!result.success) {
        throw new Error(result.error ?? 'Ollama did not report a successful start.')
      }

      await refreshOllamaStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
    } finally {
      setActionInProgress(false)
    }
  }

  const handleContinue = async () => {
    if (!canContinue) {
      return
    }

    setActionError(null)
    setActionInProgress(true)
    try {
      const nextState = await trpcMutate<FirstRunState>('firstRun.completeStep', { step: 'ollama_check' })
      onStepComplete(nextState)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      setActionInProgress(false)
    }
  }

  let description = 'Checking whether Ollama is available on this desktop…'
  if (state === 'not_installed') {
    description =
      'Ollama is not installed yet. Click "Install Ollama" to set it up automatically, or install it manually.'
  } else if (state === 'installed_stopped') {
    description =
      'Ollama is installed, but the local runtime is not running yet. Start it here, or launch it manually.'
  } else if (state === 'starting') {
    description = 'Ollama is starting. Leave this step open while the runtime comes online.'
  } else if (state === 'running') {
    description = 'Ollama is ready. You can move to model download whenever you are ready.'
  } else if (state === 'error') {
    description =
      'Ollama reported an error. Re-check the status after fixing the local runtime.'
  }

  return (
    <div className="nous-wizard__stack">
      <section className="nous-wizard__hero">
        <div className={getStatusTone(state)}>
          <span className="nous-wizard__status-dot" />
          <span>{formatLifecycleState(ollamaStatus?.state ?? 'not_installed')}</span>
        </div>
        <h1 className="nous-wizard__title">Make sure Ollama is installed and running.</h1>
        <p className="nous-wizard__subtitle">{description}</p>
      </section>

      <div className="nous-wizard__grid">
        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Current status</h2>
          <p className="nous-wizard__section-copy">
            This step stays reactive while you install or start Ollama outside the
            app. The status below updates through the preload subscription.
          </p>

          <div className="nous-wizard__meta-list">
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">State</span>
              <span className="nous-wizard__meta-value">
                {ollamaStatus ? formatLifecycleState(ollamaStatus.state) : 'Loading…'}
              </span>
            </div>
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">Installed</span>
              <span className="nous-wizard__meta-value">
                {ollamaStatus?.installed ? 'Yes' : 'Not yet'}
              </span>
            </div>
            <div className="nous-wizard__meta-item">
              <span className="nous-wizard__meta-label">Running</span>
              <span className="nous-wizard__meta-value">
                {ollamaStatus?.running ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {ollamaStatus?.error ? (
            <div className="nous-wizard__alert" role="alert">
              {ollamaStatus.error}
            </div>
          ) : null}
        </section>

        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">What to do next</h2>
          <p className="nous-wizard__section-copy">
            Install Ollama if you do not have it yet, or start the runtime and
            wait for this step to show a running state.
          </p>

          {installPhase ? (
            <div className="nous-wizard__progress" data-testid="install-progress">
              <span className="nous-wizard__progress-label">{formatInstallPhase(installPhase)}</span>
              <div className="nous-wizard__progress-track">
                <div className="nous-wizard__progress-bar" />
              </div>
            </div>
          ) : null}

          {installError ? (
            <div className="nous-wizard__alert" role="alert">
              <p>{installError}</p>
              {installElevationError ? (
                <p>
                  The installer needs elevated permissions. Please install Ollama manually
                  using the instructions above, or{' '}
                  <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                    download it from the official site
                  </a>.
                </p>
              ) : (
                <p>
                  You can also{' '}
                  <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                    download Ollama manually
                  </a>.
                </p>
              )}
            </div>
          ) : null}

          <div className="nous-wizard__button-row">
            {state === 'not_installed' && !installPhase ? (
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--primary"
                onClick={handleInstall}
                disabled={actionInProgress}
              >
                {actionInProgress ? 'Installing...' : 'Install Ollama'}
              </button>
            ) : null}

            {state === 'installed_stopped' ? (
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--primary"
                onClick={handleStart}
                disabled={actionInProgress}
              >
                {actionInProgress ? 'Starting…' : 'Start Ollama'}
              </button>
            ) : null}

            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--secondary"
              onClick={handleRefresh}
              disabled={actionInProgress}
            >
              Check again
            </button>

            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--primary"
              onClick={handleContinue}
              disabled={!canContinue || actionInProgress}
            >
              Continue
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
