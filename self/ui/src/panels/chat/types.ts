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
  // SP 1.15 RC-1 — populated when the gateway's empty-loop guard fires.
  // ChatMessageList renders <details open> on the thinking disclosure when
  // this is set, so the user can see what the model was working on. Literal
  // union duplicated (not imported from @nous/shared) per the existing
  // chat-types convention; runtime validation lives at ChatTurnResultSchema
  // in cortex-core. Cross-package consistency check lives at
  // self/shared/src/__tests__/types/agent-gateway.test.ts.
  // SP 1.17 narrows from 3 to 2 values per SDS § 1.3 (the
  // `narrate_without_dispatch` value and the SP 1.16 RC-β heuristic detector
  // + structured fallback marker pathway are removed in full).
  empty_response_kind?: 'thinking_only_no_finalizer' | 'no_output_at_all'
  // SP 1.17 RC-α-1 — populated when the gateway's structural derivation
  // gate fires (multi-turn request shape on a model declaring extendedThinking
  // capability that did not actually surface thinking). ChatMessageList
  // renders an honest acknowledgment in the thinking disclosure referencing
  // `ref` (today: 'WR-172' — Composable provider × model adapter system).
  // Literal duplicated per convention.
  thinking_unavailable?: { reason: string; ref: string }
}

export interface ActionResult {
  ok: boolean
  message: string
  traceId?: string
  contentType?: 'text' | 'openui'
}

export interface ChatAPI {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui'; thinkingContent?: string; cards?: Array<{ type: string; props: Record<string, unknown> }>; empty_response_kind?: 'thinking_only_no_finalizer' | 'no_output_at_all'; thinking_unavailable?: { reason: string; ref: string } }>
  getHistory: () => Promise<ChatMessage[]>
  sendAction?: (action: CardAction) => Promise<ActionResult>
}
