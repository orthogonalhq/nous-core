'use client'

import { ChatPanel } from '../../panels/ChatPanel'
import { useShellContext } from './ShellContext'
import type { ChatSurfaceProps } from './types'

export function ChatSurface(props: ChatSurfaceProps) {
  const { conversation } = useShellContext()

  return (
    <ChatPanel
      chatApi={props.chatApi}
      conversationContext={conversation}
      className={props.className}
      stage={props.stage}
      onStageChange={props.onStageChange}
      onSendStart={props.onSendStart}
      isPinned={props.isPinned}
      onTogglePin={props.onTogglePin}
      onInputFocus={props.onInputFocus}
      onUnreadMessage={props.onUnreadMessage}
      onMessagesRead={props.onMessagesRead}
    />
  )
}
