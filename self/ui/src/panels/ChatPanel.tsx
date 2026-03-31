'use client'

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { clsx } from 'clsx'
import type { ConversationContext } from '../components/shell/types'
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
import type { RenderCardContext } from '../components/chat/openui-adapter'
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

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui' }>
  getHistory: () => Promise<ChatMessage[]>
}

export interface ChatPanelCoreProps {
  chatApi?: ChatAPI
  conversationContext?: ConversationContext
  className?: string
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
}: {
  content: string
  stale: boolean
  actionOutcome?: ChatMessage['actionOutcome']
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
      : { onAction: () => { /* stub: full action routing is sub-phase 1.3 */ } }

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
      setThoughts([])
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

  // Find the index of the last assistant message for stale detection
  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  })()

  return (
    <div className={clsx(className)} style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--nous-space-lg) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-header-border)', fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as any, color: 'var(--nous-fg-muted)', display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
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
      </div>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--nous-space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-xl)' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-base)', marginTop: 'var(--nous-space-4xl)' }}>
            {chatApi?.send ? 'Start a conversation with Nous.' : 'Chat API not connected. Start the web backend with `pnpm dev:web`.'}
          </div>
        )}
        {historyError && (
          <div style={{ textAlign: 'center', color: 'var(--nous-state-blocked)', fontSize: 'var(--nous-font-size-sm)', padding: 'var(--nous-space-sm) 0' }}>
            {historyError}
          </div>
        )}
        {messages.map((msg, i) => {
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
        {thoughts.length > 0 && (
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
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      <div style={{ padding: 'var(--nous-space-lg) var(--nous-space-xl)', borderTop: '1px solid var(--nous-footer-border)', display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
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
    </div>
  )
}
