// ---------------------------------------------------------------------------
// renderer.ts — Render NousCardTree to React elements
// ---------------------------------------------------------------------------
// FALLBACK IMPLEMENTATION: @openuidev/react-lang v0.1.4 is not available on
// npm. This module implements a direct React renderer that maps NousCardTree
// elements to registered card components via the registry. The public API
// (renderCardTree) remains identical — when/if @openuidev packages become
// available, only this file needs to change.
// ---------------------------------------------------------------------------

import React from 'react'
import type {
  NousCardTree,
  NousCardElement,
  CardActionHandlers,
  CardRendererProps,
} from './types'
import { getCardRegistry } from './registry'

/**
 * Render a parsed NousCardTree into React elements.
 *
 * **Never throws.** Renders a fallback element for unregistered card types.
 * Each registered card type is rendered via its registered renderer component
 * with the parsed props.
 */
export function renderCardTree(
  tree: NousCardTree,
  handlers: CardActionHandlers,
): React.ReactElement {
  try {
    if (!tree || tree.length === 0) {
      return React.createElement(React.Fragment)
    }

    const children = tree.map((element, index) =>
      renderElement(element, handlers, `card-${index}`),
    )

    return React.createElement(React.Fragment, null, ...children)
  } catch {
    return React.createElement(React.Fragment)
  }
}

function renderElement(
  element: NousCardElement,
  handlers: CardActionHandlers,
  key: string,
): React.ReactElement {
  try {
    const registry = getCardRegistry()
    const definition = registry.get(element.type)

    if (!definition) {
      // Fallback for unregistered card type
      return React.createElement(
        'div',
        {
          key,
          'data-testid': 'unknown-card-fallback',
          style: {
            padding: 'var(--nous-space-sm)',
            color: 'var(--nous-fg-muted)',
            fontSize: 'var(--nous-font-size-xs)',
            border: '1px dashed var(--nous-fg-muted)',
            borderRadius: 'var(--nous-radius-sm)',
          },
        },
        `Unknown card type: ${element.type}`,
      )
    }

    const rendererProps: CardRendererProps<unknown> = {
      props: element.props,
      onAction: handlers.onAction,
    }

    return React.createElement(definition.renderer, { key, ...rendererProps })
  } catch {
    // Error rendering a specific element — return fallback
    return React.createElement(
      'div',
      {
        key,
        'data-testid': 'card-render-error',
        style: {
          padding: 'var(--nous-space-sm)',
          color: 'var(--nous-fg-muted)',
          fontSize: 'var(--nous-font-size-xs)',
        },
      },
      'Card render error',
    )
  }
}
