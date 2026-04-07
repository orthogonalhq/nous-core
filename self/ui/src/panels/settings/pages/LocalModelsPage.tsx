'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PreferencesApi, OllamaModelEntry, FeedbackState } from '../types'
import {
  sectionStyle,
  sectionTitleStyle,
  cardStyle,
  btnStyle,
  helperTextStyle,
  feedbackStyle,
  inputStyle,
} from '../styles'
import { formatFeedbackError } from './helpers'
import { ConfirmDeleteDialog } from '../../../components'

export interface LocalModelsPageProps {
  api: Pick<PreferencesApi, 'listOllamaModels' | 'pullOllamaModel' | 'deleteOllamaModel' | 'getSystemStatus'>
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function LocalModelsPage({ api }: LocalModelsPageProps) {
  const [models, setModels] = useState<OllamaModelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaRunning, setOllamaRunning] = useState(false)
  const [pullInput, setPullInput] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullStatus, setPullStatus] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OllamaModelEntry | null>(null)

  const loadModels = useCallback(async () => {
    try {
      const status = await api.getSystemStatus()
      setOllamaRunning(status.ollama.running)

      if (status.ollama.running && api.listOllamaModels) {
        const result = await api.listOllamaModels()
        setModels(result.models)
      } else {
        setModels([])
      }
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const handlePull = async () => {
    if (!pullInput.trim() || pulling || !api.pullOllamaModel) return

    setPulling(true)
    setPullStatus('Pulling...')
    setFeedback(null)

    try {
      await api.pullOllamaModel(pullInput.trim())
      setPullStatus(null)
      setPullInput('')
      setFeedback({ message: `Successfully pulled ${pullInput.trim()}`, success: true })
      await loadModels()
    } catch (err) {
      setPullStatus(null)
      setFeedback(formatFeedbackError(err))
    } finally {
      setPulling(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !api.deleteOllamaModel) return

    const name = deleteTarget.name
    setDeleteTarget(null)
    setFeedback(null)

    try {
      await api.deleteOllamaModel(name)
      setFeedback({ message: `Deleted ${name}`, success: true })
      await loadModels()
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    }
  }

  if (loading) {
    return (
      <div data-testid="settings-page-local-models">
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Local Models</div>
          <div style={helperTextStyle}>Loading...</div>
        </div>
      </div>
    )
  }

  if (!ollamaRunning) {
    return (
      <div data-testid="settings-page-local-models">
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Local Models</div>
          <div style={cardStyle}>
            <div style={feedbackStyle(false)}>
              Ollama is not running. Start Ollama to manage local models.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="settings-page-local-models">
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Local Models</div>

        {/* Pull section */}
        <div style={{ ...cardStyle, display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={pullInput}
            onChange={(e) => setPullInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePull() }}
            placeholder="Model name (e.g. llama3.2)"
            disabled={pulling}
            style={{ ...inputStyle, minWidth: '200px' }}
            data-testid="pull-model-input"
          />
          <button
            style={{
              ...btnStyle('primary'),
              opacity: !pullInput.trim() || pulling ? 0.5 : 1,
              cursor: !pullInput.trim() || pulling ? 'not-allowed' : 'pointer',
            }}
            onClick={handlePull}
            disabled={!pullInput.trim() || pulling}
            data-testid="pull-model-button"
          >
            {pulling ? 'Pulling...' : 'Pull Model'}
          </button>
          {pullStatus && (
            <div style={helperTextStyle} data-testid="pull-status">
              {pullStatus}
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={feedbackStyle(feedback.success)}>
            {feedback.message}
          </div>
        )}

        {/* Model cards */}
        {models.length === 0 ? (
          <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-md)' }}>
            No models installed. Pull a model to get started.
          </div>
        ) : (
          models.map((model) => (
            <div key={model.name} style={cardStyle} data-testid="model-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as never, color: 'var(--nous-fg)' }}>
                    {model.name}
                  </div>
                  <div style={helperTextStyle}>
                    {formatSize(model.size)}
                  </div>
                </div>
                <button
                  style={btnStyle('ghost')}
                  onClick={() => setDeleteTarget(model)}
                  data-testid="delete-model-button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDeleteDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        itemName={deleteTarget?.name ?? ''}
        itemType="model"
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description={`This will remove the model from your local Ollama installation. Type DELETE to confirm.`}
      />
    </div>
  )
}
