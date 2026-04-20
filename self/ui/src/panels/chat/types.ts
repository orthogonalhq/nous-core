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
  // SP 1.15 RC-1 + SP 1.16 RC-β.1 — populated when the gateway's empty-loop
  // guard or narrate-without-dispatch guard fires. ChatMessageList renders
  // <details open> on the thinking disclosure when this is set, so the user
  // can see what the model was working on (or failed to do). Literal union
  // duplicated (not imported from @nous/shared) per the existing chat-types
  // convention; runtime validation lives at ChatTurnResultSchema in
  // cortex-core. Cross-package consistency check lives at
  // self/shared/src/__tests__/types/agent-gateway.test.ts.
  empty_response_kind?: 'thinking_only_no_finalizer' | 'no_output_at_all' | 'narrate_without_dispatch'
}

export interface ActionResult {
  ok: boolean
  message: string
  traceId?: string
  contentType?: 'text' | 'openui'
}

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui'; thinkingContent?: string; cards?: Array<{ type: string; props: Record<string, unknown> }>; empty_response_kind?: 'thinking_only_no_finalizer' | 'no_output_at_all' | 'narrate_without_dispatch' }>
  getHistory: () => Promise<ChatMessage[]>
  sendAction?: (action: CardAction) => Promise<ActionResult>
}
