import type { IDockviewPanelProps } from 'dockview-react'
import { ChatPanel } from '@nous/ui/panels'
import { ChatSurface, useShellContext } from '@nous/ui/components'
import { useChatApi } from '@nous/transport'

/** Wrapper that wires ChatPanel to tRPC via useChatApi (dockview). */
export function DesktopChatPanel(props: IDockviewPanelProps) {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined })
  return <ChatPanel {...props} params={{ chatApi }} />
}

/** Wrapper that wires ChatSurface to tRPC via useChatApi (simple mode). */
export function ConnectedChatSurface() {
  const { activeProjectId } = useShellContext()
  const chatApi = useChatApi({ projectId: activeProjectId ?? undefined })
  return <ChatSurface chatApi={chatApi} />
}
