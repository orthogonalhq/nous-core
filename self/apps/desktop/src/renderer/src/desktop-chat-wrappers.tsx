import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { ChatPanel } from '@nous/ui/panels'
import { ChatSurface, useShellContext, type ChatStage } from '@nous/ui/components'
import { useChatApi, trpc } from '@nous/transport'

/** Wrapper that wires ChatPanel to tRPC via useChatApi (dockview).
 *
 * SP 1.6 — also fires the one-shot welcome message trigger on first mount.
 * The trigger is gated by a renderer-side ref (mount-once, guards against
 * React StrictMode double-invocation in development) plus the backend's
 * persisted `welcomeMessageSent` flag (cross-mount idempotency). See SDS
 * § 1.2 (the dockview principal chat panel is the chat-init delegate per
 * Decision 6 § Mechanism step 1; `useChatApi`, `ChatPanel`, and
 * `ConnectedChatSurface` are deliberately NOT modified per SDS § 0 Note 1
 * and Note 4).
 */
export function DesktopChatPanel(props: IDockviewPanelProps & { sessionId?: string }) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId: props.sessionId })

  const welcomeFiredRef = useRef(false)
  const fireWelcome = trpc.chat.fireWelcomeIfUnsent.useMutation()

  useEffect(() => {
    if (welcomeFiredRef.current) return
    welcomeFiredRef.current = true
    fireWelcome
      .mutateAsync({ projectId: activeProjectId ?? undefined })
      .catch(() => {
        // Defensive only — the coordinator never throws (failure modes are
        // returned as `welcomeFired: false`). A throw at this surface is a
        // transport-layer error (network, serialization). Log via console;
        // do not propagate (must not block ChatPanel render).
        console.warn('[nous:welcome] fireWelcomeIfUnsent transport error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount-once; activeProjectId changes do not re-trigger (the backend flag handles cross-project re-mount).


  return <ChatPanel {...props} params={{ chatApi }} />
}

/** Wrapper that wires ChatSurface to tRPC via useChatApi (simple mode). */
export function ConnectedChatSurface({ sessionId, stage, onStageChange, onSendStart, isPinned, onTogglePin, onInputFocus, onUnreadMessage, onMessagesRead }: { sessionId?: string; stage?: ChatStage; onStageChange?: (stage: ChatStage) => void; onSendStart?: () => void; isPinned?: boolean; onTogglePin?: () => void; onInputFocus?: () => void; onUnreadMessage?: () => void; onMessagesRead?: () => void } = {}) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId })
  return <ChatSurface chatApi={chatApi} stage={stage} onStageChange={onStageChange} onSendStart={onSendStart} isPinned={isPinned} onTogglePin={onTogglePin} onInputFocus={onInputFocus} onUnreadMessage={onUnreadMessage} onMessagesRead={onMessagesRead} />
}
