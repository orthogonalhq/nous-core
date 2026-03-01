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

interface ChatPanelProps extends IDockviewPanelProps {
  params?: { chatApi?: ChatAPI }
}

export function ChatPanel({ params }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const chatApi = params?.chatApi

  useEffect(() => {
    if (chatApi) {
      chatApi.getHistory().then(setMessages)
    }
  }, [chatApi])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || sending || !chatApi) return
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }
    const recognition: SpeechRecognition = new SpeechRecognition()
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e', color: '#cccccc' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #3c3c3c', fontSize: '12px', fontWeight: 600, color: '#9d9d9d' }}>
        Principal ↔ Cortex
      </div>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6a6a6a', fontSize: '13px', marginTop: '40px' }}>
            {chatApi ? 'Start a conversation with Nous.' : 'Chat API not connected.'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', lineHeight: '1.5',
              background: msg.role === 'user' ? '#264f78' : '#252526',
              color: '#cccccc',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '8px 12px', borderRadius: '4px', background: '#252526', color: '#6a6a6a', fontSize: '13px' }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #3c3c3c', display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Nous... (Enter to send, Shift+Enter for newline)"
          disabled={sending}
          style={{
            flex: 1, resize: 'none', background: '#3c3c3c', border: '1px solid transparent',
            borderRadius: '4px', padding: '7px 10px', color: '#cccccc', fontSize: '13px',
            outline: 'none', lineHeight: '1.5', minHeight: '36px', maxHeight: '120px',
            fontFamily: 'inherit',
          }}
          rows={1}
        />
        <button
          onClick={toggleVoice}
          title={isListening ? 'Stop listening' : 'Voice input'}
          style={{
            background: isListening ? '#f14c4c' : '#3c3c3c', border: '1px solid transparent',
            borderRadius: '4px', padding: '7px 9px', color: isListening ? '#fff' : '#9d9d9d',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}
        >
          <i className={`codicon ${isListening ? 'codicon-circle-slash' : 'codicon-mic'}`} style={{ fontSize: '14px' }} />
        </button>
        <button
          onClick={send}
          disabled={sending || !input.trim() || !chatApi}
          style={{
            background: '#007acc', border: 'none', borderRadius: '4px',
            padding: '7px 14px', color: '#fff', cursor: sending ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 500, opacity: (sending || !input.trim() || !chatApi) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
