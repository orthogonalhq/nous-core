// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider, useToast } from '../ToastContext'
import { NousToast } from '../NousToast'

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockRaiseMutate = vi.fn().mockResolvedValue({ id: 'notif-1' })
const mockDismissMutate = vi.fn().mockResolvedValue({ id: 'notif-1' })
const mockGetFetch = vi.fn()
let mockEventSubscriptions: Array<{ channels: string[]; onEvent: (...args: any[]) => void }> = []

vi.mock('@nous/transport', () => ({
  trpc: {
    useUtils: () => ({
      client: {
        notifications: {
          raise: { mutate: mockRaiseMutate },
          dismiss: { mutate: mockDismissMutate },
        },
      },
      notifications: {
        get: { fetch: mockGetFetch },
      },
    }),
  },
  useEventSubscription: (opts: any) => {
    mockEventSubscriptions.push(opts)
  },
}))

// Helper to trigger showToast from tests
function ToastTrigger({ options }: { options: Parameters<ReturnType<typeof useToast>['showToast']>[0] }) {
  const { showToast } = useToast()
  return (
    <button onClick={() => showToast(options)} data-testid="trigger">
      Show
    </button>
  )
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <NousToast />
      {children}
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockEventSubscriptions = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NousToast', () => {
  it('showToast calls tRPC raise mutation with correct kind: toast payload', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Hello toast', severity: 'info' }} />
      </TestWrapper>,
    )

    fireEvent.click(screen.getByTestId('trigger'))

    expect(mockRaiseMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'toast',
        transient: true,
        source: 'toast-provider',
        toast: expect.objectContaining({
          severity: 'info',
          dismissible: true,
          durationMs: 8000,
        }),
      }),
    )
  })

  it('toast appears when notification:raised SSE event with kind toast arrives', async () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Unused', severity: 'info' }} />
      </TestWrapper>,
    )

    const sub = mockEventSubscriptions.find(
      (s) => s.channels.includes('notification:raised'),
    )!

    mockGetFetch.mockResolvedValueOnce({
      id: 'toast-sse-1',
      kind: 'toast',
      message: 'SSE toast message',
      toast: {
        severity: 'warning',
        dismissible: true,
        durationMs: 5000,
      },
    })

    await act(async () => {
      sub.onEvent('notification:raised', { kind: 'toast', id: 'toast-sse-1' })
      // Allow fetch to resolve
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('SSE toast message')).toBeTruthy()
  })

  it('toast auto-dismisses after durationMs and calls tRPC dismiss', async () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Unused', severity: 'info' }} />
      </TestWrapper>,
    )

    const sub = mockEventSubscriptions.find(
      (s) => s.channels.includes('notification:raised'),
    )!

    mockGetFetch.mockResolvedValueOnce({
      id: 'toast-auto-dismiss',
      kind: 'toast',
      message: 'Temporary',
      toast: {
        severity: 'warning',
        dismissible: true,
        durationMs: 3000,
      },
    })

    await act(async () => {
      sub.onEvent('notification:raised', { kind: 'toast', id: 'toast-auto-dismiss' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Temporary')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.queryByText('Temporary')).toBeNull()
    expect(mockDismissMutate).toHaveBeenCalledWith({ id: 'toast-auto-dismiss' })
  })

  it('caps at 3 visible toasts, removing oldest', async () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Unused', severity: 'info' }} />
      </TestWrapper>,
    )

    const sub = mockEventSubscriptions.find(
      (s) => s.channels.includes('notification:raised'),
    )!

    for (let i = 1; i <= 4; i++) {
      mockGetFetch.mockResolvedValueOnce({
        id: `toast-${i}`,
        kind: 'toast',
        message: `Toast ${i}`,
        toast: {
          severity: 'info',
          dismissible: true,
          durationMs: null,
        },
      })

      await act(async () => {
        sub.onEvent('notification:raised', { kind: 'toast', id: `toast-${i}` })
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    // Toast 1 should have been evicted; toasts 2, 3, 4 visible
    const container = screen.getByTestId('toast-container')
    const alerts = container.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBe(3)
    expect(screen.queryByTestId('toast-toast-1')).toBeNull()
    expect(screen.getByTestId('toast-toast-2')).toBeTruthy()
    expect(screen.getByTestId('toast-toast-3')).toBeTruthy()
    expect(screen.getByTestId('toast-toast-4')).toBeTruthy()
  })

  it('client-side dedup prevents duplicate tRPC calls within 60s window', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ id: 'dedup', message: 'First', severity: 'warning', durationMs: null }} />
      </TestWrapper>,
    )

    // Show first toast
    fireEvent.click(screen.getByTestId('trigger'))
    expect(mockRaiseMutate).toHaveBeenCalledTimes(1)

    // Try to show same id again
    fireEvent.click(screen.getByTestId('trigger'))

    // Should not call raise again (dedup)
    expect(mockRaiseMutate).toHaveBeenCalledTimes(1)
  })

  it('dismissToast calls tRPC dismiss mutation', async () => {
    function DismissTrigger() {
      const { dismissToast } = useToast()
      return (
        <button onClick={() => dismissToast('toast-dismiss-1')} data-testid="dismiss-trigger">
          Dismiss
        </button>
      )
    }

    render(
      <TestWrapper>
        <DismissTrigger />
      </TestWrapper>,
    )

    fireEvent.click(screen.getByTestId('dismiss-trigger'))
    expect(mockDismissMutate).toHaveBeenCalledWith({ id: 'toast-dismiss-1' })
  })
})
