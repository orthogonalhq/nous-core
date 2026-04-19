'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { clsx } from 'clsx'
import { LoaderCircle, Circle } from 'lucide-react'
import type { ConversationContext, ChatStage } from '../components/shell/types'
import { useEventSubscription } from '@nous/transport'
import type { ThoughtEvent } from '../components/thought'
import { useCardActionHandler } from '../components/chat/hooks/useCardActionHandler'
// Side-effect import: registers all 5 card types at module evaluation time
import '../components/chat/cards/index'

import { MarkdownRenderer } from '../components/chat'
import { ChatInput } from './chat/ChatInput'
import { ChatMessageList } from './chat/ChatMessageList'
import { AmbientTeleprompter } from './chat/AmbientTeleprompter'
import { useAgentActivity } from './chat/useAgentActivity'
import {
    formatThoughtEvent,
    groupThoughtsByTrace,
    deriveActiveTraceId,
} from './chat/inline-thoughts'
import type { InlineThoughtItem } from './chat/inline-thoughts'

// Re-export types so existing consumers don't break
export type { ChatMessage, ActionResult, ChatAPI } from './chat/types'
import type { ChatMessage, ChatAPI } from './chat/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatPanelCoreProps {
    chatApi?: ChatAPI
    conversationContext?: ConversationContext
    className?: string
    stage?: ChatStage
    onStageChange?: (stage: ChatStage) => void
    onSendStart?: () => void
    isPinned?: boolean
    onTogglePin?: () => void
    onInputFocus?: () => void
    onUnreadMessage?: () => void
    onMessagesRead?: () => void
}

interface ChatPanelDockviewProps extends IDockviewPanelProps {
    params: { chatApi?: ChatAPI }
}

type ChatPanelProps = ChatPanelDockviewProps | ChatPanelCoreProps

/** Normalise the two prop shapes into one consistent set of values. */
function resolveProps(props: ChatPanelProps) {
    const isDockview = 'params' in props
    return {
        chatApi: isDockview ? props.params?.chatApi : props.chatApi,
        className: isDockview ? undefined : props.className,
        stage: (isDockview ? undefined : props.stage) ?? 'full' as ChatStage,
        onStageChange: isDockview ? undefined : props.onStageChange,
        onSendStart: isDockview ? undefined : props.onSendStart,
        onInputFocus: isDockview ? undefined : props.onInputFocus,
        onUnreadMessage: isDockview ? undefined : props.onUnreadMessage,
        onMessagesRead: isDockview ? undefined : props.onMessagesRead,
    }
}

// ---------------------------------------------------------------------------
// Ambient status badge (shared between "Thinking…" and "Responded")
// ---------------------------------------------------------------------------

function AmbientBadge({ icon, label, color }: {
    icon: React.ReactNode
    label: string
    color: string
}) {
    return (
        <div style={{ ...styles.ambientBadge, color }}>
            {icon}
            {label}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max inline thought items to retain across all traces. */
const INLINE_BUFFER_MAX = 200

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatPanel(props: ChatPanelProps) {
    const { chatApi, className, stage, onSendStart, onInputFocus, onUnreadMessage, onMessagesRead } = resolveProps(props)

    // --- Core state ---
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [queuedMessages, setQueuedMessages] = useState<string[]>([])
    const [historyError, setHistoryError] = useState<string | null>(null)

    // --- Unread response badge ---
    const [hasUnread, setHasUnread] = useState(false)
    const prevMessageCountRef = useRef(0)

    // --- Inline thought items (filtered, prose-style) ---
    const [inlineThoughts, setInlineThoughts] = useState<InlineThoughtItem[]>([])

    useEventSubscription({
        channels: ['thought:pfc-decision', 'thought:turn-lifecycle'],
        onEvent: (channel, payload) => {
            const event: ThoughtEvent = {
                channel: channel as ThoughtEvent['channel'],
                payload: payload as any,
            }
            const item = formatThoughtEvent(event)
            if (item) {
                setInlineThoughts(prev => [
                    ...prev.slice(-(INLINE_BUFFER_MAX - 1)),
                    item,
                ])
            }
        },
        enabled: true,
    })

    // --- Derived thought groupings ---
    const assistantTraceIds = useMemo(
        () => new Set(messages.filter(m => m.traceId).map(m => m.traceId!)),
        [messages],
    )
    const thoughtsByTrace = useMemo(
        () => groupThoughtsByTrace(inlineThoughts),
        [inlineThoughts],
    )
    const activeTraceId = useMemo(
        () => deriveActiveTraceId(inlineThoughts, assistantTraceIds),
        [inlineThoughts, assistantTraceIds],
    )

    // --- Streaming content buffer (progressive rendering) ---
    const [streamingContent, setStreamingContent] = useState('')
    const [streamingThinking, setStreamingThinking] = useState('')

    useEventSubscription({
        channels: ['chat:content-chunk'],
        onEvent: (_channel, payload) => {
            const p = payload as { content: string }
            if (p.content) {
                setStreamingContent(prev => prev + p.content)
            }
        },
        enabled: sending,
    })

    useEventSubscription({
        channels: ['chat:thinking-chunk'],
        onEvent: (_channel, payload) => {
            const p = payload as { content: string }
            if (p.content) {
                setStreamingThinking(prev => prev + p.content)
            }
        },
        enabled: sending,
    })

    // --- Agent activity tracking (sidebar modes only) ---
    const isSmall = stage === 'small'
    const trackActivity = !('params' in props) && !isSmall
    const agentActive = useAgentActivity(trackActivity)

    // Mark unread when a new assistant message arrives outside full stage
    useEffect(() => {
        if (messages.length > prevMessageCountRef.current) {
            const latest = messages[messages.length - 1]
            if (latest?.role === 'assistant' && stage !== 'full') {
                setHasUnread(true)
                onUnreadMessage?.()
            }
        }
        prevMessageCountRef.current = messages.length
    }, [messages, stage, onUnreadMessage])

    // Clear unread when the user opens full view
    useEffect(() => {
        if (stage === 'full' && hasUnread) {
            setHasUnread(false)
            onMessagesRead?.()
        }
    }, [stage, hasUnread, onMessagesRead])

    // --- Card actions ---
    const handleCardAction = useCardActionHandler({ chatApi: chatApi ?? {}, setMessages })

    // --- History fetch ---
    useEffect(() => {
        if (chatApi?.getHistory) {
            chatApi.getHistory().then((history) => {
                // Pre-set the count so the unread-detection effect doesn't
                // treat the initial history load as a new assistant message.
                prevMessageCountRef.current = history.length
                setMessages(history)
            }).catch(() => {
                setHistoryError('Could not load previous messages.')
            })
        }
    }, [chatApi])

    // --- Send ---

    // invoke() performs the actual chatApi.send call. Shared by:
    //   - immediate-send path (called from send() when no turn is in flight)
    //   - drain path (called from the queue-drain effect after a turn ends)
    // The skipUserAppend flag suppresses the user-message append in the
    // drain path because the enqueue path already appended the entry
    // (with queued=true) at submission time.
    const invoke = async (userMsg: string, skipUserAppend = false) => {
        setSending(true)
        onSendStart?.()

        if (!skipUserAppend) {
            const userEntry: ChatMessage = { role: 'user', content: userMsg, timestamp: new Date().toISOString() }
            setMessages(prev => [...prev, userEntry])
        }

        try {
            const result = await chatApi!.send(userMsg)
            // Reconcile: authoritative response replaces streaming buffer
            setStreamingContent('')
            setStreamingThinking('')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.response,
                timestamp: new Date().toISOString(),
                traceId: result.traceId,
                contentType: result.contentType,
                thinkingContent: result.thinkingContent,
                cards: result.cards,
                ...(result.empty_response_kind ? { empty_response_kind: result.empty_response_kind } : {}),
            }])
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Error: could not reach Nous.',
                timestamp: new Date().toISOString(),
            }])
        } finally {
            setSending(false)
        }
    }

    // send() is the input-event entry point. Dispatches to either:
    //   - enqueue (if a turn is currently in flight: sending=true)
    //   - immediate invoke (if idle)
    // Both paths share the !input.trim() and !chatApi?.send guards.
    const send = () => {
        if (!input.trim() || !chatApi?.send) return
        const userMsg = input.trim()
        setInput('')

        if (sending) {
            // Enqueue — FIFO order preserved by array push at tail
            setQueuedMessages(prev => [...prev, userMsg])
            setMessages(prev => [...prev, {
                role: 'user',
                content: userMsg,
                timestamp: new Date().toISOString(),
                queued: true,
            }])
            return
        }

        invoke(userMsg)
    }

    // Queue drain: fires on the sending: true → false transition.
    // Pops the FIFO head of queuedMessages, clears the queued flag on the
    // matching message-list entry, and invokes the pop'd message via the
    // shared invoke() helper with skipUserAppend=true (the enqueue path
    // already appended the entry).
    useEffect(() => {
        if (sending || queuedMessages.length === 0) return
        const [next, ...rest] = queuedMessages
        setQueuedMessages(rest)
        // Clear the queued flag on the oldest queued user-message entry (FIFO).
        setMessages(prev => {
            const idx = prev.findIndex(m => m.queued && m.role === 'user')
            if (idx < 0) return prev
            const copy = [...prev]
            const { queued: _queued, ...rest2 } = copy[idx]
            copy[idx] = rest2 as ChatMessage
            return copy
        })
        invoke(next, true)
    }, [sending, queuedMessages])

    // --- Input focus/blur forwarding ---
    const handleFocus = useCallback(() => {
        onInputFocus?.()
    }, [onInputFocus])

    const handleBlur = useCallback(() => {
        // no-op for now — thought mode removed
    }, [])

    // --- Shared sections ---
    const inputSection = (
        <ChatInput
            input={input}
            sending={sending}
            canSend={!!chatApi?.send}
            onInputChange={setInput}
            onSend={send}
            onFocus={handleFocus}
            onBlur={handleBlur}
        />
    )

    // --- Visible messages (ambient_large caps at 5 for performance) ---
    const visibleMessages = stage === 'ambient_large' ? messages.slice(-5) : messages

    // --- Ambient gradient (shared across both ambient stages) ---
    const isAmbient = stage === 'ambient_small' || stage === 'ambient_large'
    const ambientGradient = isAmbient ? <div style={styles.ambientGradient} /> : null

    // --- Stage-based rendering ---
    switch (stage) {
        case 'small':
            return (
                <div className={clsx(className)} data-chat-stage="small" style={styles.shell}>
                    {hasUnread && (
                        <AmbientBadge
                            icon={<Circle size={8} fill="var(--nous-accent)" stroke="none" />}
                            label="Responded"
                            color="var(--nous-accent)"
                        />
                    )}
                    {inputSection}
                </div>
            )

        case 'ambient_small':
            return (
                <div className={clsx(className)} data-chat-stage="ambient_small" style={styles.shell}>
                    {ambientGradient}
                    {agentActive ? (
                        <AmbientBadge
                            icon={<LoaderCircle size={12} style={styles.spinnerIcon} />}
                            label="Thinking…"
                            color="var(--nous-fg-muted)"
                        />
                    ) : hasUnread ? (
                        <AmbientBadge
                            icon={<Circle size={8} fill="var(--nous-accent)" stroke="none" />}
                            label="Responded"
                            color="var(--nous-accent)"
                        />
                    ) : null}
                    {inputSection}
                </div>
            )

        // Ambient large: teleprompter + input (Q4 — separate ephemeral feed)
        case 'ambient_large':
            return (
                <div className={clsx(className)} data-chat-stage="ambient_large" style={styles.fullShell}>
                    {ambientGradient}
                    <div style={styles.scrollArea}>
                        <AmbientTeleprompter items={inlineThoughts} />
                    </div>
                    {inputSection}
                </div>
            )

        // Full: messages with inline thoughts + input
        case 'full':
        default:
            return (
                <div
                    className={clsx(className)}
                    data-chat-stage="full"
                    style={{ ...styles.fullShell }}
                >
                    <div style={styles.scrollArea}>
                        {visibleMessages.length === 0 && !chatApi?.send && (
                            <div style={styles.emptyState}>
                                Chat API not connected. Start the web backend with `pnpm dev:web`.
                            </div>
                        )}
                        {historyError && (
                            <div style={styles.historyError}>{historyError}</div>
                        )}
                        <ChatMessageList
                            messages={visibleMessages}
                            sending={sending}
                            thoughtsByTrace={thoughtsByTrace}
                            activeTraceId={activeTraceId}
                            onCardAction={handleCardAction}
                        />
                        {sending && (streamingThinking || streamingContent) && (
                            <div style={styles.streamingPreview}>
                                {streamingThinking && (
                                    <details open style={styles.streamingThinkingDetails}>
                                        <summary style={styles.streamingThinkingSummary}>Thinking…</summary>
                                        <div style={styles.streamingThinkingBody}>
                                            <MarkdownRenderer content={streamingThinking} />
                                        </div>
                                    </details>
                                )}
                                {streamingContent && (
                                    <MarkdownRenderer content={streamingContent} />
                                )}
                            </div>
                        )}
                    </div>
                    {inputSection}
                </div>
            )
    }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
    shell: {
        display: 'flex',
        flexDirection: 'column' as const,
        color: 'var(--nous-fg)',
    },
    fullShell: {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        color: 'var(--nous-fg)',
    },
    scrollArea: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: 'var(--nous-space-2xl)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 'var(--nous-space-xl)',
    },
    emptyState: {
        textAlign: 'center' as const,
        color: 'var(--nous-fg-subtle)',
        fontSize: 'var(--nous-font-size-base)',
        marginTop: 'var(--nous-space-4xl)',
    },
    historyError: {
        textAlign: 'center' as const,
        color: 'var(--nous-state-blocked)',
        fontSize: 'var(--nous-font-size-sm)',
        padding: 'var(--nous-space-sm) 0',
    },
    ambientGradient: {
        position: 'absolute' as const,
        zIndex: -1,
        top: '-20%',
        left: 'var(--nous-space-sm)',
        right: 'var(--nous-space-sm)',
        bottom: 0,
        background: 'var(--nous-ambient-gradient)',
        pointerEvents: 'none' as const,
    },
    ambientBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-xs)',
        fontSize: 'var(--nous-font-size-xs)',
        fontFamily: 'var(--nous-font-family-mono)',
        padding: 'var(--nous-space-sm) var(--nous-space-xl)',
    },
    spinnerIcon: {
        animation: 'spin 1s linear infinite',
    },
    streamingPreview: {
        padding: 'var(--nous-space-sm) 0',
        opacity: 0.8,
        borderLeft: '2px solid var(--nous-accent)',
        paddingLeft: 'var(--nous-space-md)',
    },
    streamingThinkingDetails: {
        maxWidth: '100%',
        borderRadius: 'var(--nous-radius-md)',
        border: '1px solid var(--nous-border)',
        background: 'var(--nous-surface-nested)',
        marginBottom: 'var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-xs)',
    },
    streamingThinkingSummary: {
        cursor: 'pointer',
        padding: 'var(--nous-space-sm) var(--nous-space-md)',
        fontFamily: 'var(--nous-font-family-mono)',
        color: 'var(--nous-fg-muted)',
        userSelect: 'none' as const,
    },
    streamingThinkingBody: {
        padding: '0 var(--nous-space-md) var(--nous-space-sm)',
        color: 'var(--nous-fg-subtle)',
        lineHeight: '1.5',
    },
} as const
