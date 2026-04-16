import { parseCardContent, renderCardTree } from '../../components/chat/openui-adapter'
import type { RenderCardContext, CardAction } from '../../components/chat/openui-adapter'
import type { ChatMessage } from './types'

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
