// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ChatApiAdapter } from '@/components/shell/chat-api-adapter'

describe('ChatApiAdapter', () => {
  afterEach(() => { cleanup() })
  it('renders without crashing', () => {
    render(
      <ChatApiAdapter
        navigate={vi.fn()}
        goBack={vi.fn()}
        canGoBack={false}
      />,
    )
    expect(screen.getByTestId('chat-api-adapter')).toBeDefined()
  })

  it('accepts ContentRouterRenderProps (navigate, goBack, canGoBack)', () => {
    const navigate = vi.fn()
    const goBack = vi.fn()
    // Should not throw
    render(
      <ChatApiAdapter
        navigate={navigate}
        goBack={goBack}
        canGoBack={true}
      />,
    )
    expect(screen.getByTestId('chat-api-adapter')).toBeDefined()
  })

  it('renders placeholder content', () => {
    render(
      <ChatApiAdapter
        navigate={vi.fn()}
        goBack={vi.fn()}
        canGoBack={false}
      />,
    )
    const el = screen.getByTestId('chat-api-adapter')
    expect(el.textContent).toContain('Chat')
  })
})
