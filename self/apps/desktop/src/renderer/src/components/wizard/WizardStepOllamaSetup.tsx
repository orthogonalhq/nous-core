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
      'Ollama is not installed yet. Download it first, then return here and re-check the status.'
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
            Download Ollama if you do not have it yet, or start the runtime and
            wait for this step to show a running state.
          </p>

          <div className="nous-wizard__button-row">
            {state === 'not_installed' ? (
              <a
                className="nous-wizard__button nous-wizard__button--primary"
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Download Ollama
              </a>
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
