'use client'

import type { IDockviewPanelProps } from 'dockview-react'
import { ChatPanel } from '@nous/ui/panels'
import { ChatSurface, useShellContext, type ChatStage } from '@nous/ui/components'
import { useChatApi } from '@nous/transport'

/** Wrapper that wires ChatPanel to tRPC via useChatApi (dockview). */
export function WebChatPanel(props: IDockviewPanelProps) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined })
  return <ChatPanel {...props} params={{ chatApi }} />
}

/** Wrapper that wires ChatSurface to tRPC via useChatApi (simple mode). */
export function WebConnectedChatSurface({ stage, onStageChange, onSendStart }: { stage?: ChatStage; onStageChange?: (stage: ChatStage) => void; onSendStart?: () => void } = {}) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined })
  return <ChatSurface chatApi={chatApi} stage={stage} onStageChange={onStageChange} onSendStart={onSendStart} />
}
