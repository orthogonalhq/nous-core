// ---------------------------------------------------------------------------
// MarkdownRenderer.tsx — Sanitized Markdown-to-React renderer for chat
// ---------------------------------------------------------------------------
// Converts raw Markdown strings (from assistant text segments) into styled,
// XSS-safe React elements. Uses react-markdown for parsing and
// rehype-sanitize (default strict schema) for security.
//
// Styled with shell design tokens (--nous-* CSS custom properties) so it
// inherits theme changes automatically.
// ---------------------------------------------------------------------------

import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/**
 * Props for MarkdownRenderer.
 * The only input is raw Markdown content as a string.
 */
export interface MarkdownRendererProps {
  /** Raw Markdown source to render. May be empty. */
  content: string
}

// ---------------------------------------------------------------------------
// Styled component overrides — map Markdown elements to themed HTML
// ---------------------------------------------------------------------------

const components: Components = {
  h1: ({ children, ...props }) =>
    React.createElement('h1', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-2xl)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg)',
        margin: 'var(--nous-space-2xl) 0 var(--nous-space-md) 0',
      },
    }, children),

  h2: ({ children, ...props }) =>
    React.createElement('h2', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-xl)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg)',
        margin: 'var(--nous-space-2xl) 0 var(--nous-space-md) 0',
      },
    }, children),

  h3: ({ children, ...props }) =>
    React.createElement('h3', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-lg)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg)',
        margin: 'var(--nous-space-xl) 0 var(--nous-space-md) 0',
      },
    }, children),

  h4: ({ children, ...props }) =>
    React.createElement('h4', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-md)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg)',
        margin: 'var(--nous-space-xl) 0 var(--nous-space-sm) 0',
      },
    }, children),

  h5: ({ children, ...props }) =>
    React.createElement('h5', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-base)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg)',
        margin: 'var(--nous-space-lg) 0 var(--nous-space-sm) 0',
      },
    }, children),

  h6: ({ children, ...props }) =>
    React.createElement('h6', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-sm)',
        fontWeight: 'var(--nous-font-weight-semibold)',
        lineHeight: 'var(--nous-line-height-compact)',
        color: 'var(--nous-fg-muted)',
        margin: 'var(--nous-space-lg) 0 var(--nous-space-sm) 0',
      },
    }, children),

  p: ({ children, ...props }) =>
    React.createElement('p', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-base)',
        lineHeight: 'var(--nous-line-height-normal)',
        color: 'var(--nous-fg)',
        margin: '0 0 var(--nous-space-md) 0',
      },
    }, children),

  a: ({ children, ...props }) =>
    React.createElement('a', {
      ...props,
      style: {
        color: 'var(--nous-accent)',
        textDecoration: 'underline',
      },
      target: '_blank',
      rel: 'noopener noreferrer',
    }, children),

  code: ({ children, className, ...props }) => {
    // Fenced code blocks get wrapped in <pre><code> by react-markdown.
    // Inline code is just <code> without a parent <pre>.
    // We detect fenced blocks by the presence of a language className.
    const isBlock = typeof className === 'string' && className.startsWith('language-')
    if (isBlock) {
      return React.createElement('code', {
        ...props,
        className,
        style: {
          fontFamily: 'var(--nous-font-family-mono)',
          fontSize: 'var(--nous-font-size-sm)',
          lineHeight: 'var(--nous-line-height-normal)',
        },
      }, children)
    }
    return React.createElement('code', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family-mono)',
        fontSize: 'var(--nous-font-size-sm)',
        backgroundColor: 'var(--nous-bg-elevated)',
        padding: '1px var(--nous-space-xs)',
        borderRadius: 'var(--nous-radius-xs)',
        color: 'var(--nous-fg)',
      },
    }, children)
  },

  pre: ({ children, ...props }) =>
    React.createElement('pre', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family-mono)',
        fontSize: 'var(--nous-font-size-sm)',
        lineHeight: 'var(--nous-line-height-normal)',
        backgroundColor: 'var(--nous-bg-elevated)',
        padding: 'var(--nous-space-xl)',
        borderRadius: 'var(--nous-radius-sm)',
        border: '1px solid var(--nous-border)',
        overflow: 'auto',
        margin: '0 0 var(--nous-space-md) 0',
      },
    }, children),

  ul: ({ children, ...props }) =>
    React.createElement('ul', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-base)',
        lineHeight: 'var(--nous-line-height-normal)',
        color: 'var(--nous-fg)',
        margin: '0 0 var(--nous-space-md) 0',
        paddingLeft: 'var(--nous-space-2xl)',
      },
    }, children),

  ol: ({ children, ...props }) =>
    React.createElement('ol', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-base)',
        lineHeight: 'var(--nous-line-height-normal)',
        color: 'var(--nous-fg)',
        margin: '0 0 var(--nous-space-md) 0',
        paddingLeft: 'var(--nous-space-2xl)',
      },
    }, children),

  li: ({ children, ...props }) =>
    React.createElement('li', {
      ...props,
      style: {
        margin: '0 0 var(--nous-space-xs) 0',
      },
    }, children),

  blockquote: ({ children, ...props }) =>
    React.createElement('blockquote', {
      ...props,
      style: {
        borderLeft: '3px solid var(--nous-accent)',
        paddingLeft: 'var(--nous-space-xl)',
        margin: '0 0 var(--nous-space-md) 0',
        color: 'var(--nous-fg-muted)',
        fontStyle: 'italic',
      },
    }, children),

  table: ({ children, ...props }) =>
    React.createElement('table', {
      ...props,
      style: {
        fontFamily: 'var(--nous-font-family)',
        fontSize: 'var(--nous-font-size-sm)',
        borderCollapse: 'collapse',
        width: '100%',
        margin: '0 0 var(--nous-space-md) 0',
      },
    }, children),

  th: ({ children, ...props }) =>
    React.createElement('th', {
      ...props,
      style: {
        fontWeight: 'var(--nous-font-weight-semibold)',
        textAlign: 'left',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        borderBottom: '2px solid var(--nous-border-strong)',
        color: 'var(--nous-fg)',
      },
    }, children),

  td: ({ children, ...props }) =>
    React.createElement('td', {
      ...props,
      style: {
        textAlign: 'left',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        borderBottom: '1px solid var(--nous-border)',
        color: 'var(--nous-fg)',
      },
    }, children),

  hr: (props) =>
    React.createElement('hr', {
      ...props,
      style: {
        border: 'none',
        borderTop: '1px solid var(--nous-border)',
        margin: 'var(--nous-space-xl) 0',
      },
    }),

  img: ({ alt, ...props }) =>
    React.createElement('img', {
      ...props,
      alt: alt ?? '',
      style: {
        maxWidth: '100%',
        borderRadius: 'var(--nous-radius-sm)',
      },
    }),
}

// ---------------------------------------------------------------------------
// rehype-sanitize plugin configuration (default strict schema)
// ---------------------------------------------------------------------------

const remarkPlugins = [remarkGfm] as never[]
const rehypePlugins = [[rehypeSanitize, defaultSchema]] as never[]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MarkdownRendererInner({ content }: MarkdownRendererProps) {
  if (!content) return null

  return React.createElement(ReactMarkdown, {
    remarkPlugins,
    rehypePlugins,
    components,
    children: content,
  })
}

/**
 * Sanitized Markdown renderer for assistant chat messages.
 *
 * Converts raw Markdown to themed, XSS-safe React elements using
 * react-markdown + rehype-sanitize with the default strict schema.
 *
 * Memoized on content string equality — identical content does not
 * cause re-renders.
 */
export const MarkdownRenderer = React.memo(
  MarkdownRendererInner,
  (prev, next) => prev.content === next.content,
)

MarkdownRenderer.displayName = 'MarkdownRenderer'
