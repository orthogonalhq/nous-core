'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { ChatPanel } from '@nous/ui/panels'
import { ChatSurface, useShellContext, type ChatStage } from '@nous/ui/components'
import { useChatApi } from '@nous/transport'

/** Wrapper that wires ChatPanel to tRPC via useChatApi (dockview).
 *
 * SP 1.9 Fix #7 — `projectId` + `sessionId` threaded into `<ChatPanel>`
 * so the `chat.getHistory.useQuery` consumer subscribes (gated `enabled:
 * projectId != null`).
 */
export function WebChatPanel(props: IDockviewPanelProps & { sessionId?: string }) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId: props.sessionId })
  return (
    <ChatPanel
      {...props}
      params={{
        chatApi,
        projectId: activeProjectId ?? undefined,
        sessionId: props.sessionId,
      }}
    />
  )
}

/** Wrapper that wires ChatSurface to tRPC via useChatApi (simple mode).
 *
 * SP 1.9 Fix #7 — same `projectId` + `sessionId` threading as `WebChatPanel`.
 */
export function WebConnectedChatSurface({ sessionId, stage, onStageChange, onSendStart, isPinned, onTogglePin, onInputFocus, onUnreadMessage, onMessagesRead }: { sessionId?: string; stage?: ChatStage; onStageChange?: (stage: ChatStage) => void; onSendStart?: () => void; isPinned?: boolean; onTogglePin?: () => void; onInputFocus?: () => void; onUnreadMessage?: () => void; onMessagesRead?: () => void } = {}) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId })
  return <ChatSurface chatApi={chatApi} stage={stage} onStageChange={onStageChange} onSendStart={onSendStart} isPinned={isPinned} onTogglePin={onTogglePin} onInputFocus={onInputFocus} onUnreadMessage={onUnreadMessage} onMessagesRead={onMessagesRead} projectId={activeProjectId ?? undefined} sessionId={sessionId} />
}
