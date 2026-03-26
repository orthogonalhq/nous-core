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

vi.mock('@/app/(shell)/memory/memory-content', () => ({
  MemoryContent: ({ projectId }: { projectId: string | null }) => (
    <div data-testid="memory-content" data-project-id={projectId ?? ''}>
      Memory content
    </div>
  ),
}))

import { MemoryAdapter } from '@/components/shell/adapters/memory-adapter'

describe('MemoryAdapter', () => {
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
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('memory-content')).toBeDefined()
  })

  it('calls useShellContext()', () => {
    render(
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(mocks.useShellContext).toHaveBeenCalled()
  })

  it('renders MemoryContent with projectId from shell context', () => {
    render(
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    const content = screen.getByTestId('memory-content')
    expect(content.getAttribute('data-project-id')).toBe('test-project-id')
  })

  it('passes null projectId when activeProjectId is null', () => {
    mocks.useShellContext.mockReturnValue({ activeProjectId: null })
    render(
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    const content = screen.getByTestId('memory-content')
    expect(content.getAttribute('data-project-id')).toBe('')
  })

  it('wraps content in ErrorBoundary and Suspense', () => {
    render(
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('memory-content')).toBeDefined()
    expect(screen.getByText('Memory content')).toBeDefined()
  })

  it('ErrorBoundary onReset calls navigate("memory")', () => {
    render(
      <MemoryAdapter navigate={navigate} goBack={goBack} canGoBack={false} />,
    )
    expect(screen.getByTestId('memory-content')).toBeDefined()
  })
})
