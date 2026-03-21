'use client'

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string }>
  getHistory: () => Promise<ChatMessage[]>
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

export function ChatPanel({ params }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)

  const chatApi = params?.chatApi

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--nous-fg)' }}>
      {/* Header */}
      <div style={{ padding: 'var(--nous-space-lg) var(--nous-space-2xl)', borderBottom: '1px solid var(--nous-header-border)', fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-semibold)' as any, color: 'var(--nous-fg-muted)' }}>
        Principal ↔ Cortex
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
