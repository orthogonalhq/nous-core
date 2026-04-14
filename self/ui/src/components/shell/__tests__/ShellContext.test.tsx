// @vitest-environment jsdom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ShellProvider, useShellContext } from '../ShellContext'

function ShellContextConsumer() {
  const context = useShellContext()

  return (
    <div>
      {context.mode}|{context.breakpoint}|{context.activeRoute}|{context.conversation.tier}
    </div>
  )
}

describe('ShellContext', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderToStaticMarkup(<ShellContextConsumer />)).toThrow(
      'useShellContext must be used within ShellProvider',
    )
  })

  it('provides context values to children', () => {
    const markup = renderToStaticMarkup(
      <ShellProvider
        mode="developer"
        breakpoint="medium"
        activeRoute="catalog"
        conversation={{
          tier: 'thread',
          threadId: 'thread-1',
          projectId: null,
          isAmbient: false,
        }}
      >
        <ShellContextConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('developer|medium|catalog|thread')
  })

  it('provides onProjectChange callback when specified', () => {
    const onProjectChange = (id: string) => id

    function ProjectChangeConsumer() {
      const context = useShellContext()
      return <div>{typeof context.onProjectChange}</div>
    }

    const markup = renderToStaticMarkup(
      <ShellProvider onProjectChange={onProjectChange}>
        <ProjectChangeConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('function')
  })

  it('does not include onProjectChange when not provided', () => {
    function ProjectChangeConsumer() {
      const context = useShellContext()
      return <div>{String(context.onProjectChange)}</div>
    }

    const markup = renderToStaticMarkup(
      <ShellProvider>
        <ProjectChangeConsumer />
      </ShellProvider>,
    )

    expect(markup).toContain('undefined')
  })
})
