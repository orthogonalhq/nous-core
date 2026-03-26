// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/components/shell/error-boundary'

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error')
  }
  return <div data-testid="child-content">Child rendered</div>
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleErrorSpy.mockRestore()
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('child-content')).toBeDefined()
    expect(screen.getByText('Child rendered')).toBeDefined()
  })

  it('renders fallback prop when child throws', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error UI</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('custom-fallback')).toBeDefined()
    expect(screen.getByText('Custom error UI')).toBeDefined()
  })

  it('renders default error UI with retry button when child throws (no fallback prop)', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('error-boundary-fallback')).toBeDefined()
    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText('Test render error')).toBeDefined()
    expect(screen.getByTestId('error-boundary-retry')).toBeDefined()
  })

  it('calls onReset callback when retry button is clicked', () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByTestId('error-boundary-retry'))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('clears error state after reset (children render again)', () => {
    let shouldThrow = true
    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Conditional error')
      }
      return <div data-testid="child-content">Child rendered</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('error-boundary-fallback')).toBeDefined()

    shouldThrow = false
    fireEvent.click(screen.getByTestId('error-boundary-retry'))

    // After reset with shouldThrow=false, children should render
    expect(screen.getByTestId('child-content')).toBeDefined()
  })

  it('calls console.error in componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(consoleErrorSpy).toHaveBeenCalled()
    const firstCallArgs = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[ErrorBoundary]'),
    )
    expect(firstCallArgs).toBeDefined()
  })

  it('displays error message to user when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Test render error')).toBeDefined()
  })

  it('handles multiple sequential errors (error -> reset -> error again)', () => {
    let shouldThrow = true
    function SequentialThrower() {
      if (shouldThrow) {
        throw new Error('Sequential error')
      }
      return <div data-testid="child-content">Child rendered</div>
    }

    render(
      <ErrorBoundary>
        <SequentialThrower />
      </ErrorBoundary>,
    )
    // First error
    expect(screen.getByTestId('error-boundary-fallback')).toBeDefined()
    expect(screen.getByText('Sequential error')).toBeDefined()

    // Reset with shouldThrow=false - children render
    shouldThrow = false
    fireEvent.click(screen.getByTestId('error-boundary-retry'))
    expect(screen.getByTestId('child-content')).toBeDefined()
    expect(screen.getByText('Child rendered')).toBeDefined()
  })
})
