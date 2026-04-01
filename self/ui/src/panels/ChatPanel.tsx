'use client'

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { clsx } from 'clsx'
import type { ConversationContext, ChatStage } from '../components/shell/types'
import { useEventSubscription } from '@nous/transport'
import {
  ThoughtStream,
  ThoughtToggle,
  ThoughtSummary,
  useThoughtMode,
  BUFFER_MAX,
} from '../components/thought'
import type { ThoughtEvent } from '../components/thought'
import { parseCardContent, renderCardTree } from '../components/chat/openui-adapter'
import type { RenderCardContext, CardAction } from '../components/chat/openui-adapter'
import { useCardActionHandler } from '../components/chat/hooks/useCardActionHandler'
// Side-effect import: registers all 5 card types at module evaluation time
import '../components/chat/cards/index'

const OPENUI_PREFIX = '%%openui\n'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  traceId?: string
  contentType?: 'text' | 'openui'
  actionOutcome?: {
    actionType: string
    label: string
    timestamp: string
  }
}

export interface ActionResult {
  ok: boolean
  message: string
  traceId?: string
  contentType?: 'text' | 'openui'
}

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui' }>
  getHistory: () => Promise<ChatMessage[]>
  sendAction?: (action: import('../components/chat/openui-adapter').CardAction) => Promise<ActionResult>
}

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
}

interface BrowserSpeechRecognitionResult {
  transcript: string
}

interface BrowserSpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<BrowserSpeechRecognitionResult>>
}

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

interface ChatPanelProps extends IDockviewPanelProps {
  params: { chatApi?: ChatAPI }
}

/**
 * Determine whether a message should be treated as OpenUI card content.
 * Uses contentType metadata (primary) with %%openui\n prefix fallback (secondary).
 * Returns the content to render (with prefix stripped if needed) and the detected type.
 */
function detectCardContent(msg: ChatMessage): { isCard: boolean; content: string } {
  if (msg.contentType === 'openui') {
    return { isCard: true, content: msg.content }
  }
  if (!msg.contentType && msg.content.startsWith(OPENUI_PREFIX)) {
    return { isCard: true, content: msg.content.slice(OPENUI_PREFIX.length) }
  }
  return { isCard: false, content: msg.content }
}

/**
 * Render an OpenUI card message. Falls back to plain text on parse failure.
 * Never throws.
 */
function ChatCardRenderer({
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
      return (
        <div data-testid="card-parse-error">
          <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
          <div style={{
            fontSize: 'var(--nous-font-size-2xs)',
            color: 'var(--nous-fg-subtle)',
            marginTop: 'var(--nous-space-xs)',
          }}>
            Could not render card
          </div>
        </div>
      )
    }

    const context: RenderCardContext = {
      stale,
      ...(actionOutcome ? { actionOutcome } : {}),
    }
    const handlers = stale
      ? { onAction: () => {} }
      : { onAction: onAction ?? (() => {}) }

    return (
      <div data-testid="openui-card-container" {...(stale ? { 'data-stale': 'true' } : {})}>
        {stale && <span data-testid="stale-card" style={{ display: 'none' }} />}
        {renderCardTree(parsed.tree, handlers, context)}
        {actionOutcome && (
          <div
            data-testid="action-outcome-badge"
            style={{
              fontSize: 'var(--nous-font-size-2xs)',
              color: 'var(--nous-fg-muted)',
              marginTop: 'var(--nous-space-xs)',
              padding: 'var(--nous-space-xs) var(--nous-space-sm)',
              background: 'var(--nous-bg-elevated)',
              borderRadius: 'var(--nous-radius-xs)',
              display: 'inline-block',
            }}
          >
            {actionOutcome.label}
          </div>
        )}
      </div>
    )
  } catch {
    // Never-throws invariant: fall back to plain text
    return (
      <div data-testid="card-parse-error">
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
        <div style={{
          fontSize: 'var(--nous-font-size-2xs)',
          color: 'var(--nous-fg-subtle)',
          marginTop: 'var(--nous-space-xs)',
        }}>
          Could not render card
        </div>
      </div>
    )
  }
}

export function ChatPanel(props: ChatPanelProps | ChatPanelCoreProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)

  const [thoughts, setThoughts] = useState<ThoughtEvent[]>([])
  const detailsAlwaysOn = useState(
    () => {
      try { return localStorage.getItem('nous:thoughts-expanded') === 'true' }
      catch { return false }
    }
  )[0]

  const chatApi = 'params' in props ? props.params?.chatApi : props.chatApi
  const conversationContext = 'conversationContext' in props ? props.conversationContext : undefined
  const className = 'className' in props ? props.className : undefined
  const stage: ChatStage | undefined = 'stage' in props ? props.stage : undefined
  const onStageChange = 'onStageChange' in props ? props.onStageChange : undefined
  const onSendStart = 'onSendStart' in props ? props.onSendStart : undefined
  const isPinned = 'isPinned' in props ? props.isPinned : undefined
  const onTogglePin = 'onTogglePin' in props ? props.onTogglePin : undefined
  const onInputFocusProp = 'onInputFocus' in props ? props.onInputFocus : undefined

  // Resolve effective stage: undefined means full (backwards compatible for dockview)
  const effectiveStage = stage ?? 'full'
  const isSmall = effectiveStage === 'small'
  const isAmbientSmall = effectiveStage === 'ambient_small'
  const isAmbientLarge = effectiveStage === 'ambient_large'
  const isFull = effectiveStage === 'full'

  // In ambient_large mode, only show last 5 messages for performance
  const visibleMessages = isAmbientLarge ? messages.slice(-5) : messages

  const handleCardAction = useCardActionHandler({ chatApi: chatApi ?? {}, setMessages })

  useEffect(() => {
    if (chatApi?.getHistory) {
      chatApi.getHistory().then(setMessages).catch(() => {
        setHistoryError('Could not load previous messages.')
      })
    }
  }, [chatApi])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const { mode, dispatch, isExpanded } = useThoughtMode({
    detailsAlwaysOn,
    sending,
  })

  // Track whether the agent is actively processing (SSE-driven)
  const [agentActive, setAgentActive] = useState(false)
  const agentIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEventSubscription({
    channels: ['thought:pfc-decision', 'thought:turn-lifecycle'],
    onEvent: (channel, payload) => {
      setThoughts(prev => [
        ...prev.slice(-(BUFFER_MAX - 1)),
        { channel: channel as ThoughtEvent['channel'], payload: payload as any },
      ])
    },
    enabled: true,
  })

  // Subscribe to turn lifecycle + inference events for activity detection
  // Only active when in sidebar mode (stage is defined) — not needed for full/dockview
  // In 5-state model, the app layer drives activity via useChatStageManager,
  // but ChatPanel still tracks agentActive for its own "Thinking..." indicator
  const trackActivity = stage !== undefined && isSmall === false
  useEventSubscription({
    channels: ['thought:turn-lifecycle', 'inference:stream-start', 'inference:stream-complete', 'system:turn-ack'],
    onEvent: (channel, payload) => {
      const p = payload as Record<string, unknown>

      // Activity starts
      if (
        channel === 'inference:stream-start' ||
        (channel === 'thought:turn-lifecycle' && p.phase === 'turn-start') ||
        (channel === 'system:turn-ack')
      ) {
        setAgentActive(true)
        if (agentIdleTimerRef.current) {
          clearTimeout(agentIdleTimerRef.current)
          agentIdleTimerRef.current = null
        }
      }

      // Activity ends — idle after brief delay to avoid flicker
      if (
        (channel === 'thought:turn-lifecycle' && p.phase === 'turn-complete') ||
        (channel === 'inference:stream-complete')
      ) {
        if (agentIdleTimerRef.current) clearTimeout(agentIdleTimerRef.current)
        agentIdleTimerRef.current = setTimeout(() => {
          setAgentActive(false)
          agentIdleTimerRef.current = null
        }, 2000)
      }
    },
    enabled: trackActivity,
  })

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (agentIdleTimerRef.current) clearTimeout(agentIdleTimerRef.current)
    }
  }, [])

  // Activity detection for UI indicators (Thinking... dot)
  // Auto-expand is now handled by useChatStageManager in the app layer
  const isAgentWorking = sending || agentActive || thoughts.length > 0

  const handleToggle = useCallback(() => {
    dispatch({ type: 'TOGGLE_EXPAND' })
    try {
      const next = !isExpanded
      localStorage.setItem('nous:thoughts-expanded', String(next))
    } catch { /* localStorage unavailable */ }
  }, [dispatch, isExpanded])

  const handleInputFocus = useCallback(() => {
    dispatch({ type: 'FOCUS_INPUT' })
  }, [dispatch])

  const handleInputBlur = useCallback(() => {
    if (!sending) {
      dispatch({ type: 'BLUR_INPUT' })
    }
  }, [dispatch, sending])

  const send = async () => {
    if (!input.trim() || sending || !chatApi?.send) return
    const userMsg = input.trim()
    setInput('')
    setSending(true)
    onSendStart?.()
    const userEntry: ChatMessage = { role: 'user', content: userMsg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userEntry])
    try {
      const result = await chatApi.send(userMsg)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        traceId: result.traceId,
        contentType: result.contentType,
      }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: could not reach Nous.', timestamp: new Date().toISOString() }])
    } finally {
      setSending(false)
      // Don't clear thoughts here — let SSE turn-complete / idle timer handle it
      // so "Thinking..." persists while the agent is still processing downstream
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const toggleVoice = () => {
    const speechRecognitionWindow = window as unknown as {
      SpeechRecognition?: BrowserSpeechRecognitionConstructor
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
    }
    const speechRecognitionCtor =
      speechRecognitionWindow.SpeechRecognition ??
      speechRecognitionWindow.webkitSpeechRecognition
    if (!speechRecognitionCtor) return
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }
    const recognition = new speechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      setInput(prev => prev + transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const headerText = conversationContext?.threadId
    ? `Thread: ${conversationContext.threadId.length > 12 ? conversationContext.threadId.slice(0, 12) + '...' : conversationContext.threadId}`
    : conversationContext?.isAmbient
      ? 'Ambient'
      : 'Principal ↔ Cortex'

  // --- Input section (shared across all stages) ---
  const inputSection = (
    <div style={{ padding: 'var(--nous-space-lg) var(--nous-space-xl)', borderTop: (isSmall || isAmbientSmall) ? 'none' : '1px solid var(--nous-footer-border)', display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'flex-end' }}>
      <textarea
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { handleInputFocus(); onInputFocusProp?.() }}
        onBlur={handleInputBlur}
        placeholder="Message Nous... (Enter to send, Shift+Enter for newline)"
        disabled={sending}
        style={{
          flex: 1, resize: 'none', background: 'var(--nous-input-bg)', border: '1px solid transparent',
          borderRadius: 'var(--nous-radius-md)', padding: 'var(--nous-space-md) var(--nous-space-lg)', color: 'var(--nous-fg)', fontSize: 'var(--nous-font-size-base)',
          outline: 'none', lineHeight: '1.5', minHeight: '36px', maxHeight: '120px',
          fontFamily: 'inherit',
        }}
        rows={1}
      />
      <button
        onClick={toggleVoice}
        title={isListening ? 'Stop listening' : 'Voice input'}
        style={{
          background: isListening ? 'var(--nous-state-blocked)' : 'var(--nous-input-bg)', border: '1px solid transparent',
          borderRadius: 'var(--nous-radius-md)', padding: 'var(--nous-space-md)', color: isListening ? 'var(--nous-fg-on-color)' : 'var(--nous-fg-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
        }}
      >
        <i className={`codicon ${isListening ? 'codicon-circle-slash' : 'codicon-mic'}`} style={{ fontSize: 'var(--nous-icon-size-sm)' }} />
      </button>
      <button
        onClick={send}
        disabled={sending || !input.trim() || !chatApi?.send}
        style={{
          background: 'var(--nous-btn-primary-bg)', border: 'none', borderRadius: 'var(--nous-radius-md)',
          padding: 'var(--nous-space-md) var(--nous-space-2xl)', color: 'var(--nous-fg-on-color)', cursor: sending ? 'not-allowed' : 'pointer',
          fontSize: 'var(--nous-font-size-base)', fontWeight: 'var(--nous-font-weight-medium)' as any, opacity: (sending || !input.trim() || !chatApi?.send) ? 0.5 : 1,
        }}
      >
        Send
      </button>
    </div>
  )

  // --- Icon button style (shared across toggle bar and full header) ---
  const iconButtonStyle = {
    background: 'none',
    border: 'none',
    color: 'var(--nous-text-tertiary)',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '14px',
    lineHeight: 1,
    borderRadius: 'var(--nous-radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const

  // Toggle bar label: "Chat" in small, activity indicator in ambient states
  const isAmbientState = isAmbientSmall || isAmbientLarge
  const toggleLabel = isAmbientState ? '\u29BF Thinking...' : 'Chat'

  // Toggle bar: shown for small, ambient_small, and ambient_large states
  const showToggleBar = !isFull
  const stageToggleBar = showToggleBar ? (
    <div
      data-testid="chat-stage-toggle"
      style={{
        padding: 'var(--nous-space-xs) var(--nous-space-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--nous-space-xs)',
        fontSize: 'var(--nous-font-size-xs)',
        color: 'var(--nous-fg-muted)',
        userSelect: 'none',
      }}
    >
      <span style={{ cursor: 'default' }}>
        {toggleLabel}
      </span>
      {/* Icon controls */}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
        {isAmbientLarge ? (
          <>
            <button
              data-testid="stage-minimize-button"
              onClick={() => onStageChange?.('small')}
              style={iconButtonStyle}
              title="Minimize"
            >
              {'\u2500'}
            </button>
            <button
              data-testid="stage-fullscreen-button"
              onClick={() => onStageChange?.('full')}
              style={iconButtonStyle}
              title="Full screen"
            >
              {'\u2922'}
            </button>
          </>
        ) : (
          <>
            <button
              data-testid="stage-panel-button"
              onClick={() => onStageChange?.('ambient_large')}
              style={iconButtonStyle}
              title="Panel view"
            >
              {'\u25EB'}
            </button>
            <button
              data-testid="stage-fullscreen-button"
              onClick={() => onStageChange?.('full')}
              style={iconButtonStyle}
              title="Full screen"
            >
              {'\u2922'}
            </button>
          </>
        )}
      </span>
    </div>
  ) : null

  // --- Thought stream section (reused across large and full) ---
  const thoughtSection = thoughts.length > 0 ? (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{ maxWidth: '80%' }}>
        <ThoughtToggle
          expanded={isExpanded}
          eventCount={thoughts.length}
          onToggle={handleToggle}
          sending={sending}
        />
        <ThoughtStream
          thoughts={thoughts}
          mode={mode}
          style={{
            opacity: isExpanded ? 1 : 0,
            maxHeight: isExpanded
              ? mode === 'conversing:expanded' ? '200px' : '2000px'
              : '0px',
            overflow: isExpanded ? undefined : 'hidden',
          }}
        />
      </div>
    </div>
  ) : null

  // --- Small stage: toggle bar + input only ---
  if (isSmall) {
    return (
      <div className={clsx(className)} data-chat-stage="small" style={{ display: 'flex', flexDirection: 'column', color: 'var(--nous-fg)' }}>
        {stageToggleBar}
        {inputSection}
      </div>
    )
  }

  // --- Ambient Small stage: toggle bar + input only (with activity indicator in toggle) ---
  if (isAmbientSmall) {
    return (
      <div className={clsx(className)} data-chat-stage="ambient_small" style={{ display: 'flex', flexDirection: 'column', color: 'var(--nous-fg)' }}>
        {stageToggleBar}
        {inputSection}
      </div>
    )
  }

  // --- Ambient Large stage: toggle bar + thought stream + input ---
  if (isAmbientLarge) {
    return (
      <div className={clsx(className)} data-chat-stage="ambient_large" style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)' }}>
        {stageToggleBar}
        {/* Thought stream content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--nous-space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-xl)' }}>
          {thoughtSection}
          <div ref={messagesEndRef} />
        </div>
        {inputSection}
      </div>
    )
  }

  // Find the index of the last assistant message for stale detection
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  // --- Full stage: header + all messages + thought stream + input ---
  return (
    <div className={clsx(className)} data-chat-stage="full" style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--nous-space-sm) var(--nous-space-xl)', borderBottom: '1px solid var(--nous-header-border)', fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as any, color: 'var(--nous-fg-muted)', display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
        <span>{headerText}</span>
        {conversationContext?.isAmbient && (
          <span data-testid="ambient-badge" style={{ background: 'var(--nous-accent-muted)', fontSize: 'var(--nous-font-size-2xs)', borderRadius: 'var(--nous-radius-xs)', padding: '0 var(--nous-space-xs)', fontWeight: 'var(--nous-font-weight-medium)' as any }}>
            Ambient
          </span>
        )}
        {conversationContext?.threadId && (
          <span data-testid="thread-indicator" style={{ fontSize: 'var(--nous-font-size-2xs)', color: 'var(--nous-fg-subtle)', fontWeight: 'var(--nous-font-weight-regular)' as any }}>
            {conversationContext.threadId.length > 12 ? conversationContext.threadId.slice(0, 12) + '...' : conversationContext.threadId}
          </span>
        )}
        {/* Stage controls in full mode */}
        {onStageChange && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
            <button
              data-testid="stage-minimize-button"
              onClick={() => onStageChange('small')}
              style={iconButtonStyle}
              title="Minimize"
            >
              {'\u2500'}
            </button>
            <button
              data-testid="stage-panel-button"
              onClick={() => onStageChange('ambient_large')}
              style={iconButtonStyle}
              title="Panel view"
            >
              {'\u25EB'}
            </button>
            <button
              data-testid="stage-pin-button"
              onClick={() => onTogglePin?.()}
              style={{
                ...iconButtonStyle,
                color: isPinned ? 'var(--nous-fg)' : 'var(--nous-text-tertiary)',
              }}
              title={isPinned ? 'Unpin' : 'Pin open'}
            >
              {isPinned ? '\uD83D\uDCCC' : '\u2299'}
            </button>
          </span>
        )}
      </div>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--nous-space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-xl)' }}>
        {visibleMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-base)', marginTop: 'var(--nous-space-4xl)' }}>
            {chatApi?.send ? 'Start a conversation with Nous.' : 'Chat API not connected. Start the web backend with `pnpm dev:web`.'}
          </div>
        )}
        {historyError && (
          <div style={{ textAlign: 'center', color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-sm)', padding: 'var(--nous-space-sm) 0' }}>
            {historyError}
          </div>
        )}
        {visibleMessages.map((msg, i) => {
          const isAssistant = msg.role === 'assistant'
          const { isCard, content: cardContent } = isAssistant ? detectCardContent(msg) : { isCard: false, content: msg.content }
          const isStale = isAssistant && (!!msg.actionOutcome || i !== lastAssistantIndex)

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: 'var(--nous-space-md) var(--nous-space-xl)', borderRadius: 'var(--nous-radius-md)', fontSize: 'var(--nous-font-size-base)', lineHeight: '1.5',
                background: msg.role === 'user' ? 'var(--nous-chat-user-bg)' : 'var(--nous-bg-elevated)',
                color: 'var(--nous-fg)',
              }}>
                {isCard ? (
                  <ChatCardRenderer
                    content={cardContent}
                    stale={isStale}
                    actionOutcome={msg.actionOutcome}
                    onAction={isStale ? undefined : (action) => handleCardAction(action, i)}
                  />
                ) : (
                  msg.content
                )}
              </div>
              {isAssistant && msg.traceId && !sending && (
                <ThoughtSummary traceId={msg.traceId} />
              )}
            </div>
          )
        })}
        {thoughtSection}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      {inputSection}
    </div>
  )
}
