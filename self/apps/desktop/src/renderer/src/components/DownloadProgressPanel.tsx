import { useEffect, useRef, useState } from 'react'
import type { OllamaModelPullProgress } from './wizard/types'
import './DownloadProgressPanel.css'

export interface DownloadProgressPanelProps {
  modelId: string
  modelDisplayName?: string
  onComplete?: () => void
  onError?: (error: string) => void
  /**
   * Called when the component unmounts while a download is still in progress
   * (for example, when the user navigates away). This does not cancel the
   * Ollama pull; the server-side download continues.
   */
  onCancel?: () => void
}

type DownloadState = {
  status: string
  percent: number | null
  completed: number
  total: number
  speed: number
  isComplete: boolean
  error: string | null
}

const ERROR_STATUS_PATTERN = /(error|failed|failure)/i

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let index = 0

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatSpeed(value: number): string {
  if (value <= 0) {
    return 'Calculating...'
  }

  return `${formatBytes(value)}/s`
}

function getPercent(progress: OllamaModelPullProgress): number | null {
  if (typeof progress.percent === 'number' && Number.isFinite(progress.percent)) {
    return Math.max(0, Math.min(progress.percent, 100))
  }

  if (
    typeof progress.completed === 'number' &&
    typeof progress.total === 'number' &&
    progress.total > 0
  ) {
    return Math.max(0, Math.min((progress.completed / progress.total) * 100, 100))
  }

  return null
}

function getErrorMessage(status: string): string | null {
  return ERROR_STATUS_PATTERN.test(status) ? status : null
}

export function DownloadProgressPanel({
  modelId,
  modelDisplayName,
  onComplete,
  onError,
  onCancel,
}: DownloadProgressPanelProps) {
  const [downloadState, setDownloadState] = useState<DownloadState>({
    status: 'Waiting for download progress…',
    percent: 0,
    completed: 0,
    total: 0,
    speed: 0,
    isComplete: false,
    error: null,
  })

  const lastSampleRef = useRef<{ completed: number; timestamp: number } | null>(null)
  const speedSamplesRef = useRef<number[]>([])
  const lastLoggedBucketRef = useRef(-10)
  const hasCompletedRef = useRef(false)
  const hasErroredRef = useRef(false)
  const latestStateRef = useRef(downloadState)

  useEffect(() => {
    latestStateRef.current = downloadState
  }, [downloadState])

  useEffect(() => {
    const handleProgress = (progress: OllamaModelPullProgress) => {
      const nextPercent = getPercent(progress)
      const nextCompleted = typeof progress.completed === 'number' ? progress.completed : 0
      const nextTotal = typeof progress.total === 'number' ? progress.total : 0
      const nextStatus = progress.status || 'Downloading…'
      const nextError = getErrorMessage(nextStatus)
      const timestamp = Date.now()

      let nextSpeed = latestStateRef.current.speed
      if (lastSampleRef.current && nextCompleted > lastSampleRef.current.completed) {
        const elapsedMs = timestamp - lastSampleRef.current.timestamp
        if (elapsedMs > 0) {
          const bytesPerSecond =
            ((nextCompleted - lastSampleRef.current.completed) / elapsedMs) * 1000
          const nextSamples = [...speedSamplesRef.current, bytesPerSecond].slice(-5)
          speedSamplesRef.current = nextSamples
          nextSpeed =
            nextSamples.reduce((total, sample) => total + sample, 0) / nextSamples.length
        }
      }

      lastSampleRef.current = {
        completed: nextCompleted,
        timestamp,
      }

      if (typeof nextPercent === 'number') {
        const bucket = Math.floor(nextPercent / 10) * 10
        if (bucket >= 0 && bucket > lastLoggedBucketRef.current) {
          lastLoggedBucketRef.current = bucket
          console.log(`[nous:wizard] Download progress: ${bucket}%`)
        }
      }

      const isComplete = nextStatus === 'success'
      setDownloadState({
        status: nextStatus,
        percent: isComplete ? 100 : nextPercent,
        completed: nextCompleted,
        total: nextTotal,
        speed: nextSpeed,
        isComplete,
        error: nextError,
      })

      if (isComplete && !hasCompletedRef.current) {
        hasCompletedRef.current = true
        console.log(`[nous:wizard] Download complete: ${modelId}`)
        onComplete?.()
      }

      if (nextError && !hasErroredRef.current) {
        hasErroredRef.current = true
        console.log(`[nous:wizard] Download error: ${nextError}`)
        onError?.(nextError)
      }
    }

    const cleanup = window.electronAPI.ollama.onPullProgress(handleProgress)

    return () => {
      cleanup()
      const currentState = latestStateRef.current
      if (!currentState.isComplete && !currentState.error) {
        onCancel?.()
      }
    }
  }, [modelId, onCancel, onComplete, onError])

  const progressLabel =
    typeof downloadState.percent === 'number'
      ? `${Math.round(downloadState.percent)}%`
      : 'Syncing…'
  const fillClassName =
    downloadState.percent === null && !downloadState.isComplete
      ? 'nous-progress-panel__fill nous-progress-panel__fill--indeterminate'
      : 'nous-progress-panel__fill'
  const fillStyle =
    downloadState.percent === null && !downloadState.isComplete
      ? undefined
      : { width: `${downloadState.percent ?? 0}%` }
  const transferredLabel =
    downloadState.total > 0
      ? `${formatBytes(downloadState.completed)} / ${formatBytes(downloadState.total)}`
      : formatBytes(downloadState.completed)
  const statusClassName = downloadState.error
    ? 'nous-progress-panel__status nous-progress-panel__status--error'
    : downloadState.isComplete
      ? 'nous-progress-panel__status nous-progress-panel__status--success'
      : 'nous-progress-panel__status'

  return (
    <section className="nous-progress-panel" aria-live="polite">
      <header className="nous-progress-panel__header">
        <div>
          <div className="nous-progress-panel__title">
            Downloading {modelDisplayName ?? modelId}
          </div>
          <div className="nous-progress-panel__subtitle">{modelId}</div>
        </div>
        <div className="nous-progress-panel__percent" data-testid="download-percent">
          {progressLabel}
        </div>
      </header>

      <div
        className="nous-progress-panel__track"
        role="progressbar"
        aria-label={`Download progress for ${modelDisplayName ?? modelId}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={downloadState.percent ?? undefined}
      >
        <div
          className={fillClassName}
          style={fillStyle}
          data-testid="download-progress-fill"
        />
      </div>

      <div className="nous-progress-panel__meta">
        <div>
          <div className="nous-progress-panel__meta-label">Transferred</div>
          <div className="nous-progress-panel__meta-value">{transferredLabel}</div>
        </div>
        <div>
          <div className="nous-progress-panel__meta-label">Speed</div>
          <div className="nous-progress-panel__meta-value">
            {formatSpeed(downloadState.speed)}
          </div>
        </div>
        <div>
          <div className="nous-progress-panel__meta-label">Status</div>
          <div className={statusClassName}>{downloadState.error ?? downloadState.status}</div>
        </div>
      </div>
    </section>
  )
}
