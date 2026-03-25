import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createElectronAPIMock,
} from '../../test-setup'
import { DownloadProgressPanel } from '../DownloadProgressPanel'

function installMock() {
  const mock = createElectronAPIMock()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: mock,
  })
  return mock
}

describe('DownloadProgressPanel', () => {
  it('renders with required props', () => {
    installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    expect(screen.getByText('Downloading qwen2.5:7b')).toBeInTheDocument()
    expect(screen.getByTestId('download-percent')).toHaveTextContent('0%')
  })

  it('subscribes to pull progress when mounted', () => {
    const mock = installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    expect(mock.ollama.onPullProgress).toHaveBeenCalledTimes(1)
  })

  it('cleans up the pull progress subscription on unmount', () => {
    const mock = installMock()
    const cleanup = vi.fn()
    mock.ollama.onPullProgress.mockImplementation(() => cleanup)

    const view = render(<DownloadProgressPanel modelId="qwen2.5:7b" />)
    view.unmount()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('updates the progress bar width and percentage text from progress events', async () => {
    const mock = installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    mock.__emitPullProgress({
      status: 'downloading',
      percent: 42,
      completed: 42,
      total: 100,
    })

    await waitFor(() => {
      expect(screen.getByTestId('download-percent')).toHaveTextContent('42%')
      expect(screen.getByTestId('download-progress-fill')).toHaveStyle({
        width: '42%',
      })
    })
  })

  it('calls onComplete when the success status is received', async () => {
    const mock = installMock()
    const onComplete = vi.fn()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" onComplete={onComplete} />)

    mock.__emitPullProgress({
      status: 'success',
      percent: 100,
      completed: 100,
      total: 100,
    })

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onError when the progress stream reports an error status', async () => {
    const mock = installMock()
    const onError = vi.fn()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" onError={onError} />)

    mock.__emitPullProgress({
      status: 'download failed: disk full',
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('download failed: disk full')
    })
  })

  it('shows an indeterminate state when percentage information is unavailable', async () => {
    const mock = installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    mock.__emitPullProgress({
      status: 'pulling manifest',
    })

    await waitFor(() => {
      expect(screen.getByTestId('download-percent')).toHaveTextContent('Syncing…')
      expect(screen.getByTestId('download-progress-fill').className).toContain(
        'nous-progress-panel__fill--indeterminate',
      )
    })
  })

  it('calculates a percent from completed and total bytes when percent is missing', async () => {
    const mock = installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    mock.__emitPullProgress({
      status: 'downloading',
      completed: 25,
      total: 100,
    })

    await waitFor(() => {
      expect(screen.getByTestId('download-percent')).toHaveTextContent('25%')
    })
  })

  it('handles a zero total value without rendering NaN progress', async () => {
    const mock = installMock()
    render(<DownloadProgressPanel modelId="qwen2.5:7b" />)

    mock.__emitPullProgress({
      status: 'downloading',
      completed: 12,
      total: 0,
    })

    await waitFor(() => {
      expect(screen.getByTestId('download-percent')).toHaveTextContent('Syncing…')
      expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', 'NaN')
    })
  })

  it('calls onCancel when the component unmounts during an active download', async () => {
    const mock = installMock()
    const onCancel = vi.fn()
    const view = render(
      <DownloadProgressPanel modelId="qwen2.5:7b" onCancel={onCancel} />,
    )

    mock.__emitPullProgress({
      status: 'downloading',
      percent: 10,
      completed: 10,
      total: 100,
    })

    await waitFor(() => {
      expect(screen.getByTestId('download-percent')).toHaveTextContent('10%')
    })

    view.unmount()

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
