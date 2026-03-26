'use client'

import * as React from 'react'

export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Render error caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--nous-space-md)',
            padding: 'var(--nous-space-2xl)',
            color: 'var(--nous-text-secondary)',
            fontFamily: 'var(--nous-font-family)',
          }}
        >
          <h2
            style={{
              fontSize: 'var(--nous-font-size-lg)',
              fontWeight: 'var(--nous-font-weight-bold)',
              color: 'var(--nous-text-primary)',
            }}
          >
            Something went wrong
          </h2>
          <p style={{ fontSize: 'var(--nous-font-size-sm)' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            data-testid="error-boundary-retry"
            onClick={this.handleReset}
            style={{
              padding: 'var(--nous-space-sm) var(--nous-space-md)',
              borderRadius: 'var(--nous-radius-sm)',
              border: '1px solid var(--nous-border)',
              background: 'var(--nous-surface)',
              color: 'var(--nous-text-primary)',
              cursor: 'pointer',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
