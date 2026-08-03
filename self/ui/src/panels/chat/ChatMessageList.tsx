import { useRef, useEffect } from 'react'
import { ThoughtSummary } from '../../components/thought'
import type { CardAction, RenderCardContext } from '../../components/chat/openui-adapter'
import { renderStructuredCard } from '../../components/chat/openui-adapter'
import { MarkdownRenderer } from '../../components/chat'
import { ChatCardRenderer } from './ChatCardRenderer'
import { splitMessageSegments } from './message-segments'
import { InlineThoughtGroup } from './InlineThoughtGroup'
import type { InlineThoughtItem } from './inline-thoughts'
import type { ChatMessage } from './types'

// ---------------------------------------------------------------------------
// ChatMessageList — scroll container + list orchestrator
// ---------------------------------------------------------------------------

interface ChatMessageListProps {
    messages: ChatMessage[]
    sending: boolean
    thoughtsByTrace: Map<string, InlineThoughtItem[]>
    activeTraceId: string | null
    onCardAction: (action: CardAction, messageIndex: number) => void
}

export function ChatMessageList({
    messages,
    sending,
    thoughtsByTrace,
    activeTraceId,
    onCardAction,
}: ChatMessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        const assistantMessages = messages.filter((m) => m.role === 'assistant')
        const lastMessage = messages[messages.length - 1]
        const lastAssistant = assistantMessages[assistantMessages.length - 1]

        console.warn('[ChatPanelRenderer] message-list-rendered', {
            messageCount: messages.length,
            assistantCount: assistantMessages.length,
            lastRole: lastMessage?.role ?? null,
            lastContentLength: lastMessage?.content.length ?? 0,
            lastAssistantTraceId: lastAssistant?.traceId ?? null,
            lastAssistantContentLength: lastAssistant?.content.length ?? 0,
            lastAssistantPreview: lastAssistant?.content.slice(0, 80) ?? null,
            sending,
            activeTraceId,
        })
    }, [activeTraceId, messages, sending])

    const lastAssistantIndex = findLastAssistantIndex(messages)

    return (
        <>
            {messages.map((msg, i) => (
                <ChatMessageRow
                    key={i}
                    message={msg}
                    isLastAssistant={i === lastAssistantIndex}
                    thoughts={
                        msg.role === 'assistant' && msg.traceId
                            ? thoughtsByTrace.get(msg.traceId)
                            : undefined
                    }
                    sending={sending}
                    onCardAction={(action) => onCardAction(action, i)}
                />
            ))}

            {/* In-progress turn thoughts — live at bottom */}
            {activeTraceId && thoughtsByTrace.get(activeTraceId) && (
                <InlineThoughtGroup
                    items={thoughtsByTrace.get(activeTraceId)!}
                    active
                />
            )}

            <div ref={messagesEndRef} />
        </>
    )
}

// ---------------------------------------------------------------------------
// ChatMessageRow — per-message rendering
// ---------------------------------------------------------------------------

interface ChatMessageRowProps {
    message: ChatMessage
    isLastAssistant: boolean
    thoughts?: InlineThoughtItem[]
    sending: boolean
    onCardAction: (action: CardAction) => void
}

function ChatMessageRow({
    message,
    isLastAssistant,
    thoughts,
    sending,
    onCardAction,
}: ChatMessageRowProps) {
    const loggedEmptyResponseKeyRef = useRef<string | null>(null)
    const isAssistant = message.role === 'assistant'
    const hasStructuredCards = isAssistant ? (message.cards?.length ?? 0) > 0 : false
    const hasTextContent = isAssistant ? message.content.trim().length > 0 : false
    const emptyResponseDiagnostic = isAssistant
        ? getEmptyAssistantDiagnostic(message, hasStructuredCards)
        : null
    const emptyResponseLogKey = emptyResponseDiagnostic
        ? getAssistantRenderLogKey(message)
        : null
    const assistantRenderLogKey = isAssistant
        ? getAssistantRenderLogKey(message)
        : null

    useEffect(() => {
        if (!isAssistant || !assistantRenderLogKey) return

        console.warn('[ChatPanelRenderer] assistant-row-rendered', {
            traceId: message.traceId ?? null,
            timestamp: message.timestamp,
            contentLength: message.content.length,
            contentPreview: message.content.slice(0, 80),
            hasTextContent,
            hasStructuredCards,
            cardCount: message.cards?.length ?? 0,
            hasThinkingContent: Boolean(message.thinkingContent),
            hasThinkingUnavailable: Boolean(message.thinking_unavailable),
            emptyResponseKind: message.empty_response_kind ?? null,
            isLastAssistant,
            sending,
        })
    }, [
        assistantRenderLogKey,
        hasStructuredCards,
        hasTextContent,
        isAssistant,
        isLastAssistant,
        message.cards?.length,
        message.content,
        message.empty_response_kind,
        message.thinkingContent,
        message.thinking_unavailable,
        message.timestamp,
        message.traceId,
        sending,
    ])

    useEffect(() => {
        if (!emptyResponseDiagnostic || !emptyResponseLogKey) return
        if (loggedEmptyResponseKeyRef.current === emptyResponseLogKey) return
        loggedEmptyResponseKeyRef.current = emptyResponseLogKey

        console.warn('[ChatPanelRenderer] assistant-empty-response-rendered', {
            emptyResponseKind: message.empty_response_kind ?? 'missing_final_content',
            traceId: message.traceId ?? null,
            timestamp: message.timestamp,
            contentLength: message.content.length,
            hasThinkingContent: Boolean(message.thinkingContent),
            hasThinkingUnavailable: Boolean(message.thinking_unavailable),
            hasStructuredCards,
            cardCount: message.cards?.length ?? 0,
        })
    }, [
        emptyResponseDiagnostic,
        emptyResponseLogKey,
        hasStructuredCards,
        message.cards?.length,
        message.content.length,
        message.empty_response_kind,
        message.thinkingContent,
        message.thinking_unavailable,
        message.timestamp,
        message.traceId,
    ])

    if (message.role === 'user') {
        const isQueued = message.queued === true
        return (
            <div style={styles.rowUser}>
                <div
                    data-queued={isQueued ? 'true' : undefined}
                    style={isQueued ? { ...styles.bubbleUser, ...styles.bubbleUserQueued } : styles.bubbleUser}
                >
                    {message.content}
                    {isQueued && (
                        <span style={styles.queuedMarker}> queued</span>
                    )}
                </div>
            </div>
        )
    }

    const isStale = !!message.actionOutcome || !isLastAssistant

    // Structured cards (tool-call delivery) take priority over inline XML parsing
    const segments = hasStructuredCards ? null : splitMessageSegments(message.content)
    const hasCardSegments = segments ? segments.some(s => s.type === 'card') : false

    // For structured cards, strip inline card XML from text content
    const textContent = hasStructuredCards
        ? stripCardTags(message.content)
        : null

    return (
        <div style={styles.rowAssistant}>
            {thoughts && thoughts.length > 0 && (
                <InlineThoughtGroup items={thoughts} active={false} />
            )}
            {message.thinkingContent ? (
                <details style={styles.thinkingDetails} {...(message.empty_response_kind ? { open: true } : {})}>
                    <summary style={styles.thinkingSummary}>Thinking</summary>
                    <div style={styles.thinkingBody}>
                        <MarkdownRenderer content={message.thinkingContent} />
                    </div>
                </details>
            ) : message.thinking_unavailable ? (
                // SP 1.17 RC-α-1 — honest acknowledgment for the multi-turn
                // thinking-template structural limitation. Mutually exclusive
                // with the populated-thinking branch above (thinkingContent
                // wins by ordering — Invariant I-3 defensive). Renders open
                // by default so the user sees the acknowledgment without an
                // extra click. `ref` (today: 'WR-172') is the work-register
                // row tracking the upstream structural fix.
                <details open style={styles.thinkingDetails}>
                    <summary style={styles.thinkingSummary}>Thinking</summary>
                    <div style={styles.thinkingBody}>
                        <em>Thinking unavailable on this turn — {message.thinking_unavailable.reason}. Tracked under {message.thinking_unavailable.ref}.</em>
                    </div>
                </details>
            ) : null}
            <div style={styles.bubble}>
                {hasStructuredCards ? (
                    <>
                        {textContent && textContent.trim() && (
                            <MarkdownRenderer content={textContent} />
                        )}
                        {message.cards!.map((card, cardIdx) => {
                            const ctx: RenderCardContext = {
                                stale: isStale,
                                ...(message.actionOutcome ? { actionOutcome: message.actionOutcome } : {}),
                            }
                            const handlers = {
                                onAction: isStale ? () => {} : onCardAction,
                            }
                            return renderStructuredCard(card, handlers, `card-${cardIdx}`, ctx)
                        })}
                    </>
                ) : hasCardSegments ? (
                    segments!.map((segment, segIdx) =>
                        segment.type === 'card' ? (
                            <ChatCardRenderer
                                key={`seg-${segIdx}`}
                                content={segment.content}
                                stale={isStale}
                                actionOutcome={message.actionOutcome}
                                onAction={isStale ? undefined : onCardAction}
                            />
                        ) : (
                            <MarkdownRenderer key={`seg-${segIdx}`} content={segment.content} />
                        )
                    )
                ) : emptyResponseDiagnostic ? (
                    <div
                        data-testid="assistant-empty-response-diagnostic"
                        data-empty-response-kind={message.empty_response_kind ?? 'missing_final_content'}
                        style={styles.emptyResponseDiagnostic}
                    >
                        {emptyResponseDiagnostic}
                    </div>
                ) : !hasTextContent ? null : (
                    <MarkdownRenderer content={message.content} />
                )}
            </div>
            {message.traceId && !sending && (
                <ThoughtSummary traceId={message.traceId} />
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip inline card XML tags from response text when structured cards are used. */
function stripCardTags(content: string): string {
    const CARD_TAGS = ['StatusCard', 'ActionCard', 'ApprovalCard', 'WorkflowCard', 'FollowUpBlock']
    let result = content
    for (const tag of CARD_TAGS) {
        // Remove self-closing tags: <Tag ... />
        result = result.replace(new RegExp(`<${tag}\\s[^>]*?/>`, 'g'), '')
        // Remove paired tags: <Tag ...>...</Tag>
        result = result.replace(new RegExp(`<${tag}\\s[^>]*?>[\\s\\S]*?</${tag}>`, 'g'), '')
    }
    return result
}

function findLastAssistantIndex(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') return i
    }
    return -1
}

function getEmptyAssistantDiagnostic(message: ChatMessage, hasStructuredCards: boolean): string | null {
    if (message.content.trim().length > 0 || hasStructuredCards) return null
    if (message.empty_response_kind === 'thinking_only_no_finalizer') {
        return 'No final assistant answer was returned. Thinking content is shown above when available.'
    }
    if (message.empty_response_kind === 'no_output_at_all') {
        return 'No assistant output was returned for this turn.'
    }
    return 'No assistant content was returned for this turn.'
}

function getAssistantRenderLogKey(message: ChatMessage): string {
    return [
        message.timestamp,
        message.traceId ?? '',
        message.content.length,
        message.empty_response_kind ?? 'missing_final_content',
        message.thinkingContent ? 'thinking' : '',
        message.thinking_unavailable ? 'thinking-unavailable' : '',
        message.cards?.length ?? 0,
    ].join('|')
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const row = {
    display: 'flex',
    flexDirection: 'column' as const,
    margin: 'var(--nous-space-lg) 0',
}

const bubble = {
    maxWidth: '100%',
    borderRadius: 'var(--nous-radius-md)',
    fontFamily: 'var(--nous-font-family)',
    fontSize: 'var(--nous-font-size-sm)',
    lineHeight: '1.5',
    color: 'var(--nous-fg)',
    whiteSpace: 'pre-wrap' as const,
}

const styles = {
    rowUser: {
        ...row,
        alignItems: 'flex-end'
    },
    rowAssistant: {
        ...row,
        padding: 0,
        alignItems: 'flex-start'
    },
    bubble: {
        ...bubble,
        padding: 'var(--nous-space-sm) 0',
    },
    bubbleUser: {
        ...bubble,
        padding: 'var(--nous-space-md) var(--nous-space-xl)',
        background: 'var(--nous-surface-nested)',
        border: '1px solid var(--nous-border)'
    },
    bubbleUserQueued: {
        opacity: 0.6,
        fontStyle: 'italic' as const,
    },
    queuedMarker: {
        marginLeft: 'var(--nous-space-xs)',
        fontStyle: 'italic' as const,
        color: 'var(--nous-fg-muted)',
        fontSize: 'var(--nous-font-size-xs)',
    },
    thinkingDetails: {
        maxWidth: '100%',
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid var(--nous-border)',
        background: 'var(--nous-surface-nested)',
        marginBottom: 'var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-xs)',
    },
    thinkingSummary: {
        cursor: 'pointer',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        fontFamily: 'var(--nous-font-family-mono)',
        color: 'var(--nous-fg-muted)',
        userSelect: 'none' as const,
    },
    thinkingBody: {
        padding: '0 var(--nous-space-md) var(--nous-space-sm)',
        color: 'var(--nous-fg-subtle)',
        lineHeight: '1.5',
    },
    emptyResponseDiagnostic: {
        color: 'var(--nous-fg-muted)',
        fontFamily: 'var(--nous-font-family-mono)',
        fontSize: 'var(--nous-font-size-xs)',
        lineHeight: '1.5',
        borderLeft: '2px solid var(--nous-border)',
        paddingLeft: 'var(--nous-space-md)',
    },
} as const
