'use client'

import { ChatPanel } from '../../panels/ChatPanel'
import type { ChatAPI } from '../../panels/ChatPanel'
import { useShellContext } from './ShellContext'
import type { ChatSurfaceProps } from './types'

export function ChatSurface(props: ChatSurfaceProps) {
  const { conversation } = useShellContext()

  const chatApi: ChatAPI | undefined =
    props.chatApi ?? (typeof window !== 'undefined' ? (window as any).electronAPI?.chat : undefined) ?? undefined

  return (
    <ChatPanel
      chatApi={chatApi}
      conversationContext={conversation}
      className={props.className}
    />
  )
}
