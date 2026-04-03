// @vitest-environment jsdom

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ToastProvider, useToast } from '../ToastContext'
import { NousToast } from '../NousToast'

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
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NousToast', () => {
  it('showToast adds a toast to the stack', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Hello toast', severity: 'info' }} />
      </TestWrapper>,
    )

    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Hello toast')).toBeTruthy()
  })

  it('toast auto-dismisses after durationMs', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ message: 'Temporary', severity: 'warning', durationMs: 3000 }} />
      </TestWrapper>,
    )

    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Temporary')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.queryByText('Temporary')).toBeNull()
  })

  it('dismissible toast can be manually closed', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ id: 'close-me', message: 'Closable', severity: 'info', dismissible: true }} />
      </TestWrapper>,
    )

    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Closable')).toBeTruthy()

    fireEvent.click(screen.getByTestId('toast-dismiss-close-me'))
    expect(screen.queryByText('Closable')).toBeNull()
  })

  it('caps at 3 visible toasts, removing oldest', () => {
    function MultiTrigger() {
      const { showToast } = useToast()
      return (
        <div>
          {[1, 2, 3, 4].map((i) => (
            <button
              key={i}
              data-testid={`trigger-${i}`}
              onClick={() =>
                showToast({
                  id: `toast-${i}`,
                  message: `Toast ${i}`,
                  severity: 'info',
                  durationMs: null,
                })
              }
            >
              Toast {i}
            </button>
          ))}
        </div>
      )
    }

    render(
      <TestWrapper>
        <MultiTrigger />
      </TestWrapper>,
    )

    for (let i = 1; i <= 4; i++) {
      fireEvent.click(screen.getByTestId(`trigger-${i}`))
    }

    // Toast 1 should have been evicted; toasts 2, 3, 4 visible
    const container = screen.getByTestId('toast-container')
    const alerts = container.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBe(3)
    // The first toast (Toast 1) was evicted, so only toasts 2-4 remain
    expect(screen.queryByTestId('toast-toast-1')).toBeNull()
    expect(screen.getByTestId('toast-toast-2')).toBeTruthy()
    expect(screen.getByTestId('toast-toast-3')).toBeTruthy()
    expect(screen.getByTestId('toast-toast-4')).toBeTruthy()
  })

  it('suppresses duplicate toast with same id within 60s window', () => {
    render(
      <TestWrapper>
        <ToastTrigger options={{ id: 'dedup', message: 'First', severity: 'warning', durationMs: null }} />
      </TestWrapper>,
    )

    // Show first toast
    fireEvent.click(screen.getByTestId('trigger'))
    expect(screen.getByText('First')).toBeTruthy()

    // Try to show same id again
    fireEvent.click(screen.getByTestId('trigger'))

    // Should still be just one toast (dedup)
    const container = screen.getByTestId('toast-container')
    const alerts = container.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBe(1)
  })
})
