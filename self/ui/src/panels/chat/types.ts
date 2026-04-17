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
    result?: ActionResult
  }
  cards?: Array<{ type: string; props: Record<string, unknown> }>
  queued?: boolean
}

export interface ActionResult {
  ok: boolean
  message: string
  traceId?: string
  contentType?: 'text' | 'openui'
}

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui'; thinkingContent?: string; cards?: Array<{ type: string; props: Record<string, unknown> }> }>
  getHistory: () => Promise<ChatMessage[]>
  sendAction?: (action: CardAction) => Promise<ActionResult>
}
