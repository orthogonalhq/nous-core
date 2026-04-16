import type { CardAction } from '../../components/chat/openui-adapter'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  traceId?: string
  contentType?: 'text' | 'openui'
  thinkingContent?: string
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
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui'; thinkingContent?: string }>
  getHistory: () => Promise<ChatMessage[]>
  sendAction?: (action: CardAction) => Promise<ActionResult>
}
