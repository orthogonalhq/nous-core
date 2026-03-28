import { useEffect, useMemo, useRef, useState } from 'react'
import { DownloadProgressPanel } from '../DownloadProgressPanel'
import {
  buildWizardModelOptions,
  getRecommendedModelSpec,
  parseModelSpec,
  toOllamaModelSpec,
  type FirstRunActionResult,
  type WizardStepProps,
} from './types'
import { trpcMutate } from './trpc-fetch'

export interface WizardStepModelDownloadProps extends WizardStepProps {
  selectedModelSpec: string | null
  setSelectedModelSpec: (value: string | null) => void
}

function formatRamRequiredLabel(memoryMB: number): string {
  if (memoryMB <= 0) {
    return 'No local RAM estimate'
  }

  return `${Math.max(1, Math.round(memoryMB / 1024))} GB recommended`
}

export function WizardStepModelDownload({
  state,
  prerequisites,
  selectedModelSpec,
  setSelectedModelSpec,
  actionInProgress,
  setActionError,
  setActionInProgress,
  onStepComplete,
}: WizardStepModelDownloadProps) {
  const [customModelId, setCustomModelId] = useState('')
  const [downloadRequested, setDownloadRequested] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const finalizeRef = useRef(false)
  const recommendedModelSpec = getRecommendedModelSpec(prerequisites)
  const options = useMemo(
    () => buildWizardModelOptions(prerequisites, selectedModelSpec ?? recommendedModelSpec),
    [prerequisites, recommendedModelSpec, selectedModelSpec],
  )

  const resolvedModelSpec = selectedModelSpec ?? recommendedModelSpec
  const parsedModel = resolvedModelSpec ? parseModelSpec(resolvedModelSpec) : null
  const selectedOption = options.find((option) => option.modelSpec === resolvedModelSpec)
  const canDownload =
    Boolean(parsedModel?.modelId) && parsedModel?.provider === 'ollama'
  const modelAlreadyDownloaded = state.steps.model_download.status === 'complete'
  const providerNeedsConfiguration =
    state.steps.model_download.status === 'complete' &&
    state.steps.provider_config.status !== 'complete'

  useEffect(() => {
    if (!selectedModelSpec && recommendedModelSpec) {
      setSelectedModelSpec(recommendedModelSpec)
    }
  }, [recommendedModelSpec, selectedModelSpec, setSelectedModelSpec])

  useEffect(() => {
    setCustomModelId(parsedModel?.modelId ?? '')
  }, [parsedModel?.modelId])

  const persistDownloadedModel = async (skipDownloadStep = false) => {
    if (!resolvedModelSpec || !parsedModel) {
      return
    }

    if (finalizeRef.current) {
      return
    }

    finalizeRef.current = true
    setActionInProgress(true)
    setActionError(null)
    setLocalError(null)

    try {
      if (!skipDownloadStep) {
        const downloadResult = await trpcMutate<FirstRunActionResult>(
          'firstRun.downloadModel',
          { model: parsedModel.modelId },
        )
        if (!downloadResult.success) {
          throw new Error(downloadResult.error ?? 'The backend could not mark the model as downloaded.')
        }
      }

      const providerResult = await trpcMutate<FirstRunActionResult>(
        'firstRun.configureProvider',
        { modelSpec: resolvedModelSpec },
      )
      if (!providerResult.success) {
        throw new Error(providerResult.error ?? 'The backend could not configure the selected model.')
      }

      onStepComplete(providerResult.state)
    } catch (error) {
      finalizeRef.current = false
      const message = error instanceof Error ? error.message : String(error)
      setLocalError(message)
      setActionError(message)
      setActionInProgress(false)
    }
  }

  const handleDownload = async () => {
    if (!parsedModel || parsedModel.provider !== 'ollama') {
      setActionError('Choose an Ollama model before starting the download.')
      return
    }

    finalizeRef.current = false
    setActionError(null)
    setLocalError(null)
    setDownloadRequested(true)
    setActionInProgress(true)

    try {
      await window.electronAPI.ollama.pullModel(parsedModel.modelId)
    } catch (error) {
      finalizeRef.current = false
      const message = error instanceof Error ? error.message : String(error)
      setLocalError(message)
      setActionError(message)
      setDownloadRequested(false)
      setActionInProgress(false)
    }
  }

  return (
    <div className="nous-wizard__stack">
      <section className="nous-wizard__hero">
        <div className="nous-wizard__eyebrow">Model recommendation</div>
        <h1 className="nous-wizard__title">Download the local model that fits this machine.</h1>
        <p className="nous-wizard__subtitle">
          The recommendation engine has already picked a starting point from your
          hardware profile. You can keep the default, switch to a recommended
          alternative, or type a custom Ollama model id.
        </p>
      </section>

      <div className="nous-wizard__grid">
        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Recommended models</h2>
          <p className="nous-wizard__section-copy">
            {prerequisites?.recommendations.advisory ?? 'Loading recommendations…'}
          </p>

          <div className="nous-wizard__option-list">
            {options.map((option) => {
              const isSelected = option.modelSpec === resolvedModelSpec
              return (
                <button
                  key={option.modelSpec}
                  type="button"
                  className={`nous-wizard__option ${isSelected ? 'nous-wizard__option--selected' : ''}`}
                  onClick={() => setSelectedModelSpec(option.modelSpec)}
                >
                  <div className="nous-wizard__option-title">{option.displayName}</div>
                  <div className="nous-wizard__option-copy">{option.reason}</div>
                  <div className="nous-wizard__option-meta">
                    {option.modelSpec} · {formatRamRequiredLabel(option.ramRequiredMB)}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Selected download</h2>
          <p className="nous-wizard__section-copy">
            Ollama downloads use the raw model id. The wizard keeps the full
            provider spec separately so the next step can register it as the
            desktop default provider.
          </p>

          <label className="nous-wizard__label">
            <span>Custom Ollama model id</span>
            <input
              className="nous-wizard__input"
              value={customModelId}
              onChange={(event) => {
                const nextModelId = event.target.value
                setCustomModelId(nextModelId)
                const trimmed = nextModelId.trim()
                setSelectedModelSpec(trimmed ? toOllamaModelSpec(trimmed) : null)
              }}
              placeholder="qwen2.5:7b"
            />
          </label>

          <div className="nous-wizard__summary-list">
            <div className="nous-wizard__summary-item">
              <span>Provider spec</span>
              <span>{resolvedModelSpec ?? 'Choose a model to continue'}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Download source</span>
              <span>{parsedModel?.provider ?? 'Unknown'}</span>
            </div>
          </div>

          {parsedModel && parsedModel.provider !== 'ollama' ? (
            <div className="nous-wizard__alert" role="alert">
              This first-run flow downloads Ollama models only. Choose an Ollama
              recommendation or type an Ollama model id to continue.
            </div>
          ) : null}

          {localError ? (
            <div className="nous-wizard__alert" role="alert">
              {localError}
            </div>
          ) : null}

          {modelAlreadyDownloaded ? (
            <div className="nous-wizard__status nous-wizard__status--complete">
              <span className="nous-wizard__status-dot" />
              <span>
                {providerNeedsConfiguration
                  ? 'Model download is already complete. Finish provider configuration to continue.'
                  : 'This model is already downloaded and configured.'}
              </span>
            </div>
          ) : null}

          {!modelAlreadyDownloaded && downloadRequested && parsedModel ? (
            <DownloadProgressPanel
              modelId={parsedModel.modelId}
              modelDisplayName={selectedOption?.displayName}
              onComplete={() => {
                void persistDownloadedModel(false)
              }}
              onError={(message) => {
                finalizeRef.current = false
                setLocalError(message)
                setActionError(message)
                setActionInProgress(false)
              }}
              onCancel={() => {
                console.log('[nous:wizard] Download panel unmounted before completion')
              }}
            />
          ) : null}

          <div className="nous-wizard__button-row">
            {providerNeedsConfiguration ? (
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--primary"
                onClick={() => {
                  void persistDownloadedModel(true)
                }}
                disabled={actionInProgress || !resolvedModelSpec}
              >
                {actionInProgress ? 'Saving…' : 'Use downloaded model'}
              </button>
            ) : (
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--primary"
                onClick={() => {
                  void handleDownload()
                }}
                disabled={actionInProgress || !canDownload || modelAlreadyDownloaded}
              >
                {actionInProgress ? 'Working…' : 'Download model'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
