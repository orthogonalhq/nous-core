import type { IDockviewPanelProps } from 'dockview-react'
import { ChatPanel } from '@nous/ui/panels'
import { ChatSurface, useShellContext, type ChatStage } from '@nous/ui/components'
import { useChatApi } from '@nous/transport'
import { useFireWelcomeOnMount } from './desktop-welcome-trigger'

/** Wrapper that wires ChatPanel to tRPC via useChatApi (dockview).
 *
 * SP 1.6 — fires the one-shot welcome message trigger on first mount.
 *
 * SP 1.8 (ADR 023) revisit — both `DesktopChatPanel` (dockview) and
 * `ConnectedChatSurface` (simple mode) now share the `useFireWelcomeOnMount`
 * hook so the welcome turn fires once on first-run completion regardless
 * of which shell mode the user is in. The persisted `welcomeMessageSent`
 * flag (set in the welcome-coordinator after STM append) remains the
 * cross-mount idempotency gate. The shared hook also gates on
 * `activeProjectId !== null` so the latent dockview-mode RC-3b race (where
 * `activeProjectId` is null at first render and resolves on a subsequent
 * render) is hardened.
 *
 * The SP 1.6 SDS § 0 Note 1 single-site choice (which excluded
 * `ConnectedChatSurface` from being a trigger site) is narrowly
 * superseded by ADR 023 for the welcome-trigger concern only. The SP 1.6
 * SDS § 0 Note 4 binding constraint that the trigger MUST NOT live inside
 * `useChatApi` (which has multiple consumers) is PRESERVED — the shared
 * hook lives in the two delegate wrappers, NOT inside `useChatApi`.
 * `ChatPanel`, `useChatApi`, the chat-API surface, and
 * `web-chat-wrappers.tsx` remain unmodified.
 */
export function DesktopChatPanel(props: IDockviewPanelProps & { sessionId?: string }) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId: props.sessionId })

  useFireWelcomeOnMount(activeProjectId)

  // SP 1.9 Fix #7 — thread `projectId` + `sessionId` so ChatPanel's
  // `trpc.chat.getHistory.useQuery` can subscribe (gated `enabled:
  // projectId != null`). Without these, the useQuery short-circuits and
  // the welcome turn never surfaces in the rendered history.
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
 * SP 1.8 (ADR 023) — invokes the shared `useFireWelcomeOnMount` hook so
 * first-run users in default `simple` shell mode receive the welcome
 * turn (Issue 3 closure). See the `DesktopChatPanel` docstring above for
 * the full rationale and ADR cross-reference.
 */
export function ConnectedChatSurface({ sessionId, stage, onStageChange, onSendStart, isPinned, onTogglePin, onInputFocus, onUnreadMessage, onMessagesRead }: { sessionId?: string; stage?: ChatStage; onStageChange?: (stage: ChatStage) => void; onSendStart?: () => void; isPinned?: boolean; onTogglePin?: () => void; onInputFocus?: () => void; onUnreadMessage?: () => void; onMessagesRead?: () => void } = {}) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined, sessionId })
  useFireWelcomeOnMount(activeProjectId)
  // SP 1.9 Fix #7 — thread `projectId` + `sessionId` through ChatSurface so
  // ChatPanel's `chat.getHistory.useQuery` is enabled in simple-mode.
  return <ChatSurface chatApi={chatApi} stage={stage} onStageChange={onStageChange} onSendStart={onSendStart} isPinned={isPinned} onTogglePin={onTogglePin} onInputFocus={onInputFocus} onUnreadMessage={onUnreadMessage} onMessagesRead={onMessagesRead} projectId={activeProjectId ?? undefined} sessionId={sessionId} />
}
