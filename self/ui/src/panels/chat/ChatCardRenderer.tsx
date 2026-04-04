import { parseCardContent, renderCardTree, getCardRegistry } from '../../components/chat/openui-adapter'
import type { RenderCardContext, CardAction, NousCardElement } from '../../components/chat/openui-adapter'
import type { ChatMessage } from './types'

const OPENUI_PREFIX = '%%openui\n'

/**
 * Determine whether a message should be treated as OpenUI card content.
 * Uses contentType metadata (primary) with %%openui\n prefix fallback (secondary).
 *
 * Validates that all card types in the content are registered. If any
 * unknown/hallucinated types are found, falls back to plain text rendering.
 */
export function detectCardContent(msg: ChatMessage): { isCard: boolean; content: string } {
  let candidate: string | null = null

  if (msg.contentType === 'openui') {
    candidate = msg.content
  } else if (!msg.contentType && msg.content.startsWith(OPENUI_PREFIX)) {
    candidate = msg.content.slice(OPENUI_PREFIX.length)
  }

  if (candidate !== null && containsOnlyRegisteredCards(candidate)) {
    return { isCard: true, content: candidate }
  }
  return { isCard: false, content: msg.content }
}

/** Parse content and verify every card type exists in the registry. */
function containsOnlyRegisteredCards(content: string): boolean {
  const result = parseCardContent(content)
  if (!result.ok) return false

  const registry = getCardRegistry()
  return result.tree.every(el => typeof el === 'string' || registry.has((el as NousCardElement).type))
}

/**
 * Render an OpenUI card message. Falls back to plain text on parse failure.
 * Never throws.
 */
export function ChatCardRenderer({
  content,
  stale,
  actionOutcome,
  onAction,
}: {
  content: string
  stale: boolean
  actionOutcome?: ChatMessage['actionOutcome']
  onAction?: (action: CardAction) => void
}) {
  try {
    const parsed = parseCardContent(content)
    if (!parsed.ok) {
      return <CardParseError content={content} />
    }

    const context: RenderCardContext = {
      stale,
      ...(actionOutcome ? { actionOutcome } : {}),
    }
    const handlers = {
      onAction: stale ? () => {} : (onAction ?? (() => {})),
    }

    return (
      <div data-testid="openui-card-container" {...(stale ? { 'data-stale': 'true' } : {})}>
        {stale && <span data-testid="stale-card" style={{ display: 'none' }} />}
        {renderCardTree(parsed.tree, handlers, context)}
        {actionOutcome && (
          <div data-testid="action-outcome-badge" style={styles.outcomeBadge}>
            {actionOutcome.label}
          </div>
        )}
      </div>
    )
  } catch {
    return <CardParseError content={content} />
  }
}

function CardParseError({ content }: { content: string }) {
  return (
    <div data-testid="card-parse-error">
      <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      <div style={styles.errorHint}>Could not render card</div>
    </div>
  )
}

const styles = {
  outcomeBadge: {
    fontSize: 'var(--nous-font-size-2xs)',
    color: 'var(--nous-fg-muted)',
    marginTop: 'var(--nous-space-xs)',
    padding: 'var(--nous-space-xs) var(--nous-space-sm)',
    background: 'var(--nous-bg-elevated)',
    borderRadius: 'var(--nous-radius-xs)',
    display: 'inline-block',
  },
  errorHint: {
    fontSize: 'var(--nous-font-size-2xs)',
    color: 'var(--nous-fg-subtle)',
    marginTop: 'var(--nous-space-xs)',
  },
} as const
