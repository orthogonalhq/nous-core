'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { clsx } from 'clsx'
import type { ConversationContext } from '../components/shell/types'
import { useEventSubscription } from '../hooks/useEventSubscription'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

type ThoughtEvent =
  | { channel: 'thought:pfc-decision'; payload: ThoughtPfcDecisionPayload }
  | { channel: 'thought:turn-lifecycle'; payload: ThoughtTurnLifecyclePayload }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string }>
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

export function ChatPanel(props: ChatPanelProps | ChatPanelCoreProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)

  const [thoughts, setThoughts] = useState<ThoughtEvent[]>([])
  const [thoughtsExpanded, setThoughtsExpanded] = useState(
    () => {
      try { return localStorage.getItem('nous:thoughts-expanded') === 'true' }
      catch { return false }
    }
  )

  const chatApi = 'params' in props ? props.params?.chatApi : props.chatApi
  const conversationContext = 'conversationContext' in props ? props.conversationContext : undefined
  const className = 'className' in props ? props.className : undefined

  useEffect(() => {
    if (chatApi?.getHistory) {
      chatApi.getHistory().then(setMessages).catch(() => {
        // History fetch failed — start with empty conversation
      })
    }
  }, [chatApi])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendingRef = useRef(sending)
  sendingRef.current = sending

  useEventSubscription({
    channels: ['thought:pfc-decision', 'thought:turn-lifecycle'],
    onEvent: (channel, payload) => {
      if (sendingRef.current) {
        setThoughts(prev => [...prev.slice(-19), { channel: channel as ThoughtEvent['channel'], payload: payload as any }])
      }
    },
    enabled: true,
  })

  useEffect(() => {
    if (!sending) setThoughts([])
  }, [sending])

  const toggleThoughts = () => {
    setThoughtsExpanded(prev => {
      const next = !prev
      try { localStorage.setItem('nous:thoughts-expanded', String(next)) } catch {}
      return next
    })
  }

  const send = async () => {
    if (!input.trim() || sending || !chatApi?.send) return
    const userMsg = input.trim()
    setInput('')
    setSending(true)
    const userEntry: ChatMessage = { role: 'user', content: userMsg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userEntry])
    try {
      const result = await chatApi.send(userMsg)
      setMessages(prev => [...prev, { role: 'assistant', content: result.response, timestamp: new Date().toISOString() }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: could not reach Nous.', timestamp: new Date().toISOString() }])
    } finally {
      setSending(false)
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
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: 'var(--nous-space-md) var(--nous-space-xl)', borderRadius: 'var(--nous-radius-md)', fontSize: 'var(--nous-font-size-base)', lineHeight: '1.5',
              background: msg.role === 'user' ? 'var(--nous-chat-user-bg)' : 'var(--nous-bg-elevated)',
              color: 'var(--nous-fg)',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && thoughts.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '80%' }}>
              <button
                onClick={toggleThoughts}
                data-testid="thought-toggle"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-xs)',
                  padding: 'var(--nous-space-xs) 0', display: 'flex', alignItems: 'center',
                  gap: 'var(--nous-space-xs)',
                }}
              >
                <i className={`codicon codicon-chevron-${thoughtsExpanded ? 'down' : 'right'}`}
                   style={{ fontSize: 'var(--nous-font-size-xs)' }} />
                {thoughts.length} thought{thoughts.length !== 1 ? 's' : ''}
              </button>
              {thoughtsExpanded && (
                <div data-testid="thought-stream" style={{
                  padding: 'var(--nous-space-sm) var(--nous-space-md)',
                  background: 'var(--nous-bg-elevated)',
                  borderRadius: 'var(--nous-radius-sm)',
                  fontSize: 'var(--nous-font-size-xs)',
                  color: 'var(--nous-fg-subtle)',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--nous-space-2xs)',
                }}>
                  {thoughts.map((t, i) => {
                    const label = t.channel === 'thought:pfc-decision'
                      ? (t.payload as ThoughtPfcDecisionPayload).thoughtType
                      : (t.payload as ThoughtTurnLifecyclePayload).phase
                    const content = t.channel === 'thought:pfc-decision'
                      ? (t.payload as ThoughtPfcDecisionPayload).content
                      : (t.payload as ThoughtTurnLifecyclePayload).content ?? (t.payload as ThoughtTurnLifecyclePayload).status
                    return (
                      <div key={i} data-testid="thought-event" style={{ fontFamily: 'var(--nous-font-mono)', lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--nous-accent)', fontWeight: 'var(--nous-font-weight-medium)' as any }}>
                          [{label}]
                        </span>{' '}
                        {content}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: 'var(--nous-space-md) var(--nous-space-xl)', borderRadius: 'var(--nous-radius-md)', background: 'var(--nous-bg-elevated)', color: 'var(--nous-fg-subtle)', fontSize: 'var(--nous-font-size-base)' }}>
              Thinking...
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
