'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  api: Pick<
    PreferencesApi,
    'listOllamaModels' | 'pullOllamaModel' | 'deleteOllamaModel' | 'getSystemStatus' | 'getOllamaEndpoint' | 'setOllamaEndpoint'
  >
}

const DEFAULT_ENDPOINT = 'http://localhost:11434'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

/** Sliding window speed calculation (same logic as DownloadProgressPanel). */
function useSpeedCalculator() {
  const samplesRef = useRef<Array<{ time: number; bytes: number }>>([])
  const WINDOW_SIZE = 5

  return useCallback((completed: number): number => {
    const now = Date.now()
    samplesRef.current.push({ time: now, bytes: completed })
    if (samplesRef.current.length > WINDOW_SIZE) {
      samplesRef.current.shift()
    }
    const samples = samplesRef.current
    if (samples.length < 2) return 0
    const oldest = samples[0]
    const newest = samples[samples.length - 1]
    const elapsed = (newest.time - oldest.time) / 1000
    if (elapsed <= 0) return 0
    return (newest.bytes - oldest.bytes) / elapsed
  }, [])
}

interface PullProgress {
  status: string
  total?: number
  completed?: number
  percent?: number
}

export function LocalModelsPage({ api }: LocalModelsPageProps) {
  const [models, setModels] = useState<OllamaModelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [ollamaRunning, setOllamaRunning] = useState(false)
  const [pullInput, setPullInput] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OllamaModelEntry | null>(null)

  // Endpoint config state
  const [endpointInput, setEndpointInput] = useState(DEFAULT_ENDPOINT)
  const [endpointLoading, setEndpointLoading] = useState(false)
  const [endpointSaving, setEndpointSaving] = useState(false)
  const [endpointFeedback, setEndpointFeedback] = useState<FeedbackState | null>(null)

  const calculateSpeed = useSpeedCalculator()
  const [downloadSpeed, setDownloadSpeed] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Load endpoint on mount
  useEffect(() => {
    if (!api.getOllamaEndpoint) return
    setEndpointLoading(true)
    api.getOllamaEndpoint()
      .then((result) => {
        setEndpointInput(result.endpoint)
      })
      .catch(() => {
        // Keep default
      })
      .finally(() => setEndpointLoading(false))
  }, [api])

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

  // Subscribe to SSE pull-progress events during a pull
  useEffect(() => {
    if (!pulling) {
      setPullProgress(null)
      setDownloadSpeed(0)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    // Attempt SSE subscription for pull progress
    try {
      const es = new EventSource('/api/events')
      eventSourceRef.current = es

      es.addEventListener('ollama:pull-progress', (event) => {
        try {
          const data = JSON.parse(event.data)
          // Only show progress for the model being pulled
          if (data.model === pullInput.trim()) {
            setPullProgress({
              status: data.status,
              total: data.total,
              completed: data.completed,
              percent: data.percent,
            })
            if (typeof data.completed === 'number') {
              const speed = calculateSpeed(data.completed)
              setDownloadSpeed(speed)
            }
          }
        } catch {
          // Ignore malformed events
        }
      })

      es.onerror = () => {
        // SSE not available — fall back to static text
        es.close()
        eventSourceRef.current = null
      }
    } catch {
      // SSE not supported — fall back to static text
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [pulling, pullInput, calculateSpeed])

  const handlePull = async () => {
    if (!pullInput.trim() || pulling || !api.pullOllamaModel) return

    setPulling(true)
    setPullProgress(null)
    setFeedback(null)

    try {
      await api.pullOllamaModel(pullInput.trim())
      setPullInput('')
      setFeedback({ message: `Successfully pulled ${pullInput.trim()}`, success: true })
      await loadModels()
    } catch (err) {
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

  const handleSaveEndpoint = async () => {
    if (!api.setOllamaEndpoint || endpointSaving) return
    setEndpointSaving(true)
    setEndpointFeedback(null)

    try {
      await api.setOllamaEndpoint(endpointInput.trim())
      setEndpointFeedback({ message: 'Endpoint saved', success: true })
    } catch (err) {
      setEndpointFeedback(formatFeedbackError(err))
    } finally {
      setEndpointSaving(false)
    }
  }

  const handleResetEndpoint = async () => {
    if (!api.setOllamaEndpoint || endpointSaving) return
    setEndpointSaving(true)
    setEndpointFeedback(null)

    try {
      await api.setOllamaEndpoint(null)
      setEndpointInput(DEFAULT_ENDPOINT)
      setEndpointFeedback({ message: 'Endpoint reset to default', success: true })
    } catch (err) {
      setEndpointFeedback(formatFeedbackError(err))
    } finally {
      setEndpointSaving(false)
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

  // Render pull progress inline
  const renderPullStatus = () => {
    if (!pulling) return null

    if (pullProgress && typeof pullProgress.percent === 'number') {
      const pct = Math.min(100, Math.max(0, pullProgress.percent))
      return (
        <div data-testid="pull-progress" style={{ width: '100%', marginTop: 'var(--nous-space-xs)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)', marginBottom: '4px' }}>
            <span>{pullProgress.status}</span>
            <span>
              {pullProgress.completed != null && pullProgress.total != null
                ? `${formatSize(pullProgress.completed)} / ${formatSize(pullProgress.total)}`
                : ''}
              {downloadSpeed > 0 ? ` - ${formatSpeed(downloadSpeed)}` : ''}
              {` - ${pct.toFixed(1)}%`}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'var(--nous-bg-subtle, #333)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
            data-testid="pull-progress-bar"
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--nous-accent, #4a9eff)',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )
    }

    // Fallback to static text when no SSE events arrive
    return (
      <div style={helperTextStyle} data-testid="pull-status">
        Pulling...
      </div>
    )
  }

  if (!ollamaRunning) {
    return (
      <div data-testid="settings-page-local-models">
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Local Models</div>

          {/* Endpoint config — always visible, even when Ollama is not running */}
          {api.getOllamaEndpoint && (
            <div style={{ ...cardStyle, marginBottom: 'var(--nous-space-md)' }} data-testid="endpoint-config">
              <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as never, color: 'var(--nous-fg)', marginBottom: 'var(--nous-space-xs)' }}>
                Ollama Endpoint
              </div>
              <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="url"
                  value={endpointInput}
                  onChange={(e) => setEndpointInput(e.target.value)}
                  placeholder={DEFAULT_ENDPOINT}
                  disabled={endpointLoading || endpointSaving}
                  style={{ ...inputStyle, minWidth: '260px' }}
                  data-testid="endpoint-input"
                />
                <button
                  style={{
                    ...btnStyle('primary'),
                    opacity: endpointSaving ? 0.5 : 1,
                    cursor: endpointSaving ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleSaveEndpoint}
                  disabled={endpointSaving}
                  data-testid="endpoint-save-button"
                >
                  Save
                </button>
                <button
                  style={{
                    ...btnStyle('ghost'),
                    opacity: endpointSaving ? 0.5 : 1,
                    cursor: endpointSaving ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleResetEndpoint}
                  disabled={endpointSaving}
                  data-testid="endpoint-reset-button"
                >
                  Reset to Default
                </button>
              </div>
              {endpointFeedback && (
                <div style={{ ...feedbackStyle(endpointFeedback.success), marginTop: 'var(--nous-space-xs)' }}>
                  {endpointFeedback.message}
                </div>
              )}
            </div>
          )}

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

        {/* Endpoint config */}
        {api.getOllamaEndpoint && (
          <div style={{ ...cardStyle, marginBottom: 'var(--nous-space-md)' }} data-testid="endpoint-config">
            <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as never, color: 'var(--nous-fg)', marginBottom: 'var(--nous-space-xs)' }}>
              Ollama Endpoint
            </div>
            <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="url"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder={DEFAULT_ENDPOINT}
                disabled={endpointLoading || endpointSaving}
                style={{ ...inputStyle, minWidth: '260px' }}
                data-testid="endpoint-input"
              />
              <button
                style={{
                  ...btnStyle('primary'),
                  opacity: endpointSaving ? 0.5 : 1,
                  cursor: endpointSaving ? 'not-allowed' : 'pointer',
                }}
                onClick={handleSaveEndpoint}
                disabled={endpointSaving}
                data-testid="endpoint-save-button"
              >
                Save
              </button>
              <button
                style={{
                  ...btnStyle('ghost'),
                  opacity: endpointSaving ? 0.5 : 1,
                  cursor: endpointSaving ? 'not-allowed' : 'pointer',
                }}
                onClick={handleResetEndpoint}
                disabled={endpointSaving}
                data-testid="endpoint-reset-button"
              >
                Reset to Default
              </button>
            </div>
            {endpointFeedback && (
              <div style={{ ...feedbackStyle(endpointFeedback.success), marginTop: 'var(--nous-space-xs)' }}>
                {endpointFeedback.message}
              </div>
            )}
          </div>
        )}

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
          {renderPullStatus()}
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
