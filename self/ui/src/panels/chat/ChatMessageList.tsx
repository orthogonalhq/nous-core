import { useRef, useEffect } from 'react'
import { ThoughtSummary } from '../../components/thought'
import type { CardAction } from '../../components/chat/openui-adapter'
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
    if (message.role === 'user') {
        return (
            <div style={styles.rowUser}>
                <div style={styles.bubbleUser}>{message.content}</div>
            </div>
        )
    }

    const segments = splitMessageSegments(message.content)
    const hasCardSegments = segments.some(s => s.type === 'card')
    const isStale = !!message.actionOutcome || !isLastAssistant

    return (
        <div style={styles.rowAssistant}>
            {thoughts && thoughts.length > 0 && (
                <InlineThoughtGroup items={thoughts} active={false} />
            )}
            <div style={styles.bubble}>
                {hasCardSegments ? (
                    segments.map((segment, segIdx) =>
                        segment.type === 'card' ? (
                            <ChatCardRenderer
                                key={`seg-${segIdx}`}
                                content={segment.content}
                                stale={isStale}
                                actionOutcome={message.actionOutcome}
                                onAction={isStale ? undefined : onCardAction}
                            />
                        ) : (
                            <span key={`seg-${segIdx}`} style={{ whiteSpace: 'pre-wrap' }}>
                                {segment.content}
                            </span>
                        )
                    )
                ) : (
                    message.content
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

function findLastAssistantIndex(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') return i
    }
    return -1
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
} as const
