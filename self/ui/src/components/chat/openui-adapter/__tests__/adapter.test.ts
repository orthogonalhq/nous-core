// @vitest-environment jsdom

import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import {
  parseCardContent,
  renderCardTree,
  registerNousCard,
  getCardRegistry,
} from '../index'
import type { NousCardDefinition, CardRendererProps } from '../types'
import { _clearRegistry } from '../registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDummyCard(name: string): NousCardDefinition {
  return {
    name,
    description: `Test ${name}`,
    propsSchema: { parse: (v: unknown) => v } as any,
    renderer: (({ props }: CardRendererProps<unknown>) =>
      React.createElement('div', { 'data-testid': `test-${name}` }, `Rendered ${name}`)) as any,
  }
}

// ---------------------------------------------------------------------------
// Registry tests
// ---------------------------------------------------------------------------

describe('Card Registry', () => {
  beforeEach(() => {
    _clearRegistry()
  })

  it('registers a card definition and reports has() as true', () => {
    registerNousCard(makeDummyCard('TestCard'))
    expect(getCardRegistry().has('TestCard')).toBe(true)
  })

  it('returns false for unregistered card names', () => {
    expect(getCardRegistry().has('NonExistent')).toBe(false)
  })

  it('get() returns definition for registered card', () => {
    const def = makeDummyCard('TestCard')
    registerNousCard(def)
    expect(getCardRegistry().get('TestCard')).toEqual(def)
  })

  it('get() returns undefined for unregistered card', () => {
    expect(getCardRegistry().get('NonExistent')).toBeUndefined()
  })

  it('list() returns all registered card names', () => {
    registerNousCard(makeDummyCard('CardA'))
    registerNousCard(makeDummyCard('CardB'))
    const names = getCardRegistry().list()
    expect(names).toContain('CardA')
    expect(names).toContain('CardB')
    expect(names).toHaveLength(2)
  })

  it('list() returns empty array when no cards registered', () => {
    expect(getCardRegistry().list()).toEqual([])
  })

  it('overwrites existing card with same name', () => {
    registerNousCard(makeDummyCard('TestCard'))
    const updated = makeDummyCard('TestCard')
    updated.description = 'Updated description'
    registerNousCard(updated)
    expect(getCardRegistry().get('TestCard')?.description).toBe('Updated description')
    expect(getCardRegistry().list()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('parseCardContent', () => {
  it('parses valid self-closing card markup', () => {
    const result = parseCardContent('<StatusCard title="Test" status="active" message="Hello" />')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].type).toBe('StatusCard')
      expect(result.tree[0].props.title).toBe('Test')
      expect(result.tree[0].props.status).toBe('active')
      expect(result.tree[0].props.message).toBe('Hello')
    }
  })

  it('parses card markup with JSON prop values', () => {
    const result = parseCardContent('<StatusCard title="Test" status="active" message="Hi" progress={75} />')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree[0].props.progress).toBe(75)
    }
  })

  it('parses card markup with array prop values', () => {
    const result = parseCardContent('<ActionCard title="T" description="D" actions={[{"label":"Go","actionType":"approve"}]} />')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree[0].props.actions).toEqual([{ label: 'Go', actionType: 'approve' }])
    }
  })

  it('parses card markup with closing tags', () => {
    const result = parseCardContent('<StatusCard title="Test" status="active" message="Hello">content</StatusCard>')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].type).toBe('StatusCard')
      expect(result.tree[0].children).toContain('content')
    }
  })

  it('parses multiple card elements', () => {
    const result = parseCardContent(
      '<StatusCard title="A" status="active" message="M1" /><StatusCard title="B" status="complete" message="M2" />',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree).toHaveLength(2)
      expect(result.tree[0].props.title).toBe('A')
      expect(result.tree[1].props.title).toBe('B')
    }
  })

  it('returns { ok: false } for empty string', () => {
    const result = parseCardContent('')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.raw).toBe('')
      expect(result.error).toBe('Empty content')
    }
  })

  it('returns { ok: false } for whitespace-only string', () => {
    const result = parseCardContent('   \n\t  ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Empty content')
    }
  })

  it('returns { ok: false } for plain text without card tags', () => {
    const result = parseCardContent('just some plain text without any tags')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.raw).toBe('just some plain text without any tags')
      expect(result.error).toBe('No card elements found in content')
    }
  })

  it('returns { ok: false } for invalid/malformed markup', () => {
    const result = parseCardContent('<lowercase not="a card" />')
    expect(result.ok).toBe(false)
  })

  it('handles null input gracefully', () => {
    const result = parseCardContent(null as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid input')
    }
  })

  it('handles undefined input gracefully', () => {
    const result = parseCardContent(undefined as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid input')
    }
  })

  it('never throws regardless of input', () => {
    // Test a variety of bad inputs
    const inputs = [null, undefined, 42, {}, [], true, '<<<<', '>>>>', '<Foo><Bar>']
    for (const input of inputs) {
      expect(() => parseCardContent(input as any)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// Renderer tests
// ---------------------------------------------------------------------------

describe('renderCardTree', () => {
  beforeEach(() => {
    _clearRegistry()
  })

  it('renders registered card types using their renderer', () => {
    registerNousCard(makeDummyCard('TestCard'))
    const tree = [{ type: 'TestCard', props: { value: 42 }, children: [] }]
    const handlers = { onAction: () => {} }

    const { container } = render(
      React.createElement(() => renderCardTree(tree, handlers)),
    )
    expect(container.querySelector('[data-testid="test-TestCard"]')).toBeTruthy()
    expect(container.textContent).toContain('Rendered TestCard')
  })

  it('renders fallback for unregistered card types', () => {
    const tree = [{ type: 'UnknownCard', props: {}, children: [] }]
    const handlers = { onAction: () => {} }

    const { container } = render(
      React.createElement(() => renderCardTree(tree, handlers)),
    )
    const fallback = container.querySelector('[data-testid="unknown-card-fallback"]')
    expect(fallback).toBeTruthy()
    expect(fallback?.textContent).toContain('Unknown card type: UnknownCard')
  })

  it('handles empty tree array', () => {
    const handlers = { onAction: () => {} }
    const element = renderCardTree([], handlers)
    expect(element).toBeTruthy()
    const { container } = render(React.createElement(() => element))
    expect(container.innerHTML).toBe('')
  })

  it('handles mixed registered and unregistered types', () => {
    registerNousCard(makeDummyCard('KnownCard'))
    const tree = [
      { type: 'KnownCard', props: {}, children: [] },
      { type: 'UnknownCard', props: {}, children: [] },
    ]
    const handlers = { onAction: () => {} }

    const { container } = render(
      React.createElement(() => renderCardTree(tree, handlers)),
    )
    expect(container.querySelector('[data-testid="test-KnownCard"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="unknown-card-fallback"]')).toBeTruthy()
  })

  it('never throws regardless of input', () => {
    const handlers = { onAction: () => {} }
    expect(() => renderCardTree(null as any, handlers)).not.toThrow()
    expect(() => renderCardTree(undefined as any, handlers)).not.toThrow()
    expect(() => renderCardTree([], handlers)).not.toThrow()
  })

  // Phase 1.2 — RenderCardContext parameter tests
  it('accepts optional third context parameter without error (backward compat)', () => {
    registerNousCard(makeDummyCard('TestCard'))
    const tree = [{ type: 'TestCard', props: { value: 1 }, children: [] }]
    const handlers = { onAction: () => {} }

    // No context (backward compat)
    expect(() => renderCardTree(tree, handlers)).not.toThrow()
    // With context
    expect(() => renderCardTree(tree, handlers, { stale: false })).not.toThrow()
    expect(() => renderCardTree(tree, handlers, { stale: true })).not.toThrow()
  })

  it('passes stale: true to card renderer when context.stale is true', () => {
    let receivedProps: any = null
    const staleSpy: any = {
      name: 'StaleTestCard',
      description: 'Test stale behavior',
      propsSchema: { parse: (v: unknown) => v } as any,
      renderer: ((p: any) => {
        receivedProps = p
        return React.createElement('div', { 'data-testid': 'stale-test' }, 'Stale')
      }) as any,
    }
    registerNousCard(staleSpy)
    const tree = [{ type: 'StaleTestCard', props: { v: 1 }, children: [] }]
    const handlers = { onAction: () => {} }

    render(
      React.createElement(() => renderCardTree(tree, handlers, { stale: true })),
    )
    expect(receivedProps?.stale).toBe(true)
    // onAction should NOT be passed when stale
    expect(receivedProps?.onAction).toBeUndefined()
  })

  it('passes actionOutcome to card renderer when context provides it', () => {
    let receivedProps: any = null
    const outcomeCard: any = {
      name: 'OutcomeCard',
      description: 'Test outcome',
      propsSchema: { parse: (v: unknown) => v } as any,
      renderer: ((p: any) => {
        receivedProps = p
        return React.createElement('div', null, 'Outcome')
      }) as any,
    }
    registerNousCard(outcomeCard)
    const tree = [{ type: 'OutcomeCard', props: {}, children: [] }]
    const handlers = { onAction: () => {} }
    const actionOutcome = { actionType: 'approve', label: 'Done', timestamp: '2026-01-01T00:00:00Z' }

    render(
      React.createElement(() => renderCardTree(tree, handlers, { stale: true, actionOutcome })),
    )
    expect(receivedProps?.actionOutcome).toEqual(actionOutcome)
  })

  it('passes onAction when context.stale is false', () => {
    let receivedProps: any = null
    const liveCard: any = {
      name: 'LiveCard',
      description: 'Test live',
      propsSchema: { parse: (v: unknown) => v } as any,
      renderer: ((p: any) => {
        receivedProps = p
        return React.createElement('div', null, 'Live')
      }) as any,
    }
    registerNousCard(liveCard)
    const tree = [{ type: 'LiveCard', props: {}, children: [] }]
    const mockAction = () => {}
    const handlers = { onAction: mockAction }

    render(
      React.createElement(() => renderCardTree(tree, handlers, { stale: false })),
    )
    expect(receivedProps?.onAction).toBe(mockAction)
    expect(receivedProps?.stale).toBeUndefined()
  })
})
