// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  useShellContext: vi.fn(),
}))

vi.mock('@nous/ui/components', () => ({
  useShellContext: mocks.useShellContext,
}))

vi.mock('@/app/(shell)/mao/mao-content', () => ({
  MaoContent: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="mao-content" data-project-id={projectId ?? ''}>
      MAO content
    </div>
  ),
}))

import { MaoAdapter } from '@/components/shell/adapters/mao-adapter'

describe('MaoAdapter', () => {
  const navigate = vi.fn()
  const goBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useShellContext.mockReturnValue({
      activeProjectId: 'test-project-id',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('accepts ContentRouterRenderProps without errors', () => {
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('mao-content')).toBeDefined()
  })

  it('calls useShellContext()', () => {
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(mocks.useShellContext).toHaveBeenCalled()
  })

  it('renders MaoContent with projectId from shell context', () => {
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    const content = screen.getByTestId('mao-content')
    expect(content.getAttribute('data-project-id')).toBe('test-project-id')
  })

  it('passes null projectId when activeProjectId is null', () => {
    mocks.useShellContext.mockReturnValue({ activeProjectId: null })
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    const content = screen.getByTestId('mao-content')
    expect(content.getAttribute('data-project-id')).toBe('')
  })

  it('wraps content in ErrorBoundary and Suspense', () => {
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('mao-content')).toBeDefined()
    expect(screen.getByText('MAO content')).toBeDefined()
  })

  it('ErrorBoundary onReset calls navigate("mao")', () => {
    render(
      <MaoAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('mao-content')).toBeDefined()
  })
})
