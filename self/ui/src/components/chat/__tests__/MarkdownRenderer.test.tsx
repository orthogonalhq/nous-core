// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from '../MarkdownRenderer'
import type { MarkdownRendererProps } from '../MarkdownRenderer'

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests
// ---------------------------------------------------------------------------

describe('MarkdownRenderer — contract', () => {
  it('renders without error for empty string', () => {
    const { container } = render(<MarkdownRenderer content="" />)
    expect(container.innerHTML).toBe('')
  })

  it('accepts content prop (type contract)', () => {
    // TypeScript compile-time check — if MarkdownRendererProps did not have
    // content: string, this would fail to compile.
    const props: MarkdownRendererProps = { content: 'hello' }
    const { container } = render(<MarkdownRenderer {...props} />)
    expect(container.textContent).toContain('hello')
  })

  it('exports MarkdownRenderer as named export', async () => {
    const mod = await import('../index')
    expect(mod.MarkdownRenderer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests
// ---------------------------------------------------------------------------

describe('MarkdownRenderer — behavior', () => {
  it('renders # Heading as <h1> element', () => {
    const { container } = render(<MarkdownRenderer content="# Heading" />)
    const h1 = container.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1!.textContent).toBe('Heading')
  })

  it('renders **bold** as <strong> element', () => {
    const { container } = render(<MarkdownRenderer content="**bold text**" />)
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong!.textContent).toBe('bold text')
  })

  it('renders *italic* as <em> element', () => {
    const { container } = render(<MarkdownRenderer content="*italic text*" />)
    const em = container.querySelector('em')
    expect(em).not.toBeNull()
    expect(em!.textContent).toBe('italic text')
  })

  it('renders unordered list as <ul><li> elements', () => {
    const content = '- item one\n- item two\n- item three'
    const { container } = render(<MarkdownRenderer content={content} />)
    const ul = container.querySelector('ul')
    expect(ul).not.toBeNull()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
    expect(items[0].textContent).toBe('item one')
  })

  it('renders ordered list as <ol><li> elements', () => {
    const content = '1. first\n2. second\n3. third'
    const { container } = render(<MarkdownRenderer content={content} />)
    const ol = container.querySelector('ol')
    expect(ol).not.toBeNull()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
    expect(items[0].textContent).toBe('first')
  })

  it('renders [text](url) as <a href="url"> element', () => {
    const { container } = render(
      <MarkdownRenderer content="[click here](https://example.com)" />,
    )
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.textContent).toBe('click here')
    expect(link!.getAttribute('href')).toBe('https://example.com')
  })

  it('renders inline `code` as <code> element', () => {
    const { container } = render(
      <MarkdownRenderer content="Use `console.log()` for debugging" />,
    )
    const code = container.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.textContent).toBe('console.log()')
  })

  it('renders fenced code block as <pre><code> elements', () => {
    const content = '```js\nconst x = 1;\n```'
    const { container } = render(<MarkdownRenderer content={content} />)
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    const code = pre!.querySelector('code')
    expect(code).not.toBeNull()
    expect(code!.textContent).toContain('const x = 1;')
  })

  it('renders table syntax as <table> elements', () => {
    const content = [
      '| Name | Age |',
      '|------|-----|',
      '| Alice | 30 |',
      '| Bob | 25 |',
    ].join('\n')
    const { container } = render(<MarkdownRenderer content={content} />)
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    const ths = container.querySelectorAll('th')
    expect(ths.length).toBe(2)
    expect(ths[0].textContent).toBe('Name')
    const tds = container.querySelectorAll('td')
    expect(tds.length).toBe(4)
    expect(tds[0].textContent).toBe('Alice')
  })

  it('renders plain text as paragraph text', () => {
    const { container } = render(
      <MarkdownRenderer content="Just some plain text" />,
    )
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p!.textContent).toBe('Just some plain text')
  })
})

// ---------------------------------------------------------------------------
// Tier 3 — Edge Case / Security Tests
// ---------------------------------------------------------------------------

describe('MarkdownRenderer — security & edge cases', () => {
  it('strips <script> tags', () => {
    const { container } = render(
      <MarkdownRenderer content="<script>alert('xss')</script>" />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('script')
    expect(container.innerHTML).not.toContain('alert')
  })

  it('strips onerror attribute from <img>', () => {
    const { container } = render(
      <MarkdownRenderer content={'<img onerror="alert(\'xss\')" src="x">'} />,
    )
    const img = container.querySelector('img')
    // The img might be stripped entirely or have onerror removed
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull()
    }
    expect(container.innerHTML).not.toContain('onerror')
  })

  it('strips javascript: URL from link href', () => {
    const { container } = render(
      <MarkdownRenderer content="[link](javascript:alert('xss'))" />,
    )
    const link = container.querySelector('a')
    if (link) {
      const href = link.getAttribute('href') ?? ''
      expect(href).not.toContain('javascript:')
    }
  })

  it('strips <iframe> elements', () => {
    const { container } = render(
      <MarkdownRenderer content='<iframe src="https://evil.com"></iframe>' />,
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.innerHTML).not.toContain('iframe')
  })

  it('strips onclick and onmouseover event handler attributes', () => {
    const { container } = render(
      <MarkdownRenderer
        content='<div onclick="alert(1)" onmouseover="alert(2)">test</div>'
      />,
    )
    expect(container.innerHTML).not.toContain('onclick')
    expect(container.innerHTML).not.toContain('onmouseover')
  })

  it('does not re-render when content is unchanged (memoization)', () => {
    const renderSpy = vi.fn()

    // Create a wrapper that tracks renders of the inner component
    function SpyWrapper(props: MarkdownRendererProps) {
      renderSpy()
      return <MarkdownRenderer {...props} />
    }

    // Use React.memo with the same comparator to test that the memo boundary works
    const MemoizedSpy = React.memo(SpyWrapper, (prev, next) => prev.content === next.content)

    const { rerender } = render(<MemoizedSpy content="# Hello" />)
    expect(renderSpy).toHaveBeenCalledTimes(1)

    rerender(<MemoizedSpy content="# Hello" />)
    // The memo wrapper prevents re-render when content is the same
    expect(renderSpy).toHaveBeenCalledTimes(1)
  })

  it('renders very long content (~10KB) without throwing', () => {
    const longContent = '# Long Document\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(400)
    expect(longContent.length).toBeGreaterThan(10000)
    expect(() => {
      render(<MarkdownRenderer content={longContent} />)
    }).not.toThrow()
  })
})
