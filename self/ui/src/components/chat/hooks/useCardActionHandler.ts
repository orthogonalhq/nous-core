import { useCallback, useContext } from 'react'
import { ShellContext } from '../../shell/ShellContext'
import type { CardAction } from '../openui-adapter/types'
import type { ChatMessage, ActionResult } from '../../../panels/ChatPanel'

export interface UseCardActionHandlerOptions {
  chatApi: {
    sendAction?: (action: CardAction) => Promise<ActionResult>
  }
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

/**
 * Hook that returns a handler for card action events.
 *
 * - `navigate` actions are handled client-side via shell context `navigate()`
 * - All other action types are dispatched via `chatApi.sendAction()`
 * - On successful dispatch, sets `actionOutcome` on the originating message
 *   to transition the card to stale state.
 *
 * Gracefully handles absence of ShellProvider — navigate actions become no-ops.
 */
export function useCardActionHandler({ chatApi, setMessages }: UseCardActionHandlerOptions) {
  const shellContext = useContext(ShellContext)

  return useCallback(
    (action: CardAction, messageIndex: number) => {
      if (action.actionType === 'navigate') {
        const { panel, ...params } = action.payload as Record<string, unknown>
        shellContext?.navigate(String(panel), Object.keys(params).length > 0 ? params : undefined)
        return
      }

      if (!chatApi.sendAction) return

      chatApi.sendAction(action).then((result) => {
        setMessages(prev =>
          prev.map((msg, i) =>
            i === messageIndex
              ? {
                  ...msg,
                  actionOutcome: {
                    actionType: action.actionType,
                    label: action.actionType,
                    timestamp: new Date().toISOString(),
                    result,
                  },
                }
              : msg,
          ),
        )
      }).catch((err) => {
        setMessages(prev =>
          prev.map((msg, i) =>
            i === messageIndex
              ? {
                  ...msg,
                  actionOutcome: {
                    actionType: action.actionType,
                    label: action.actionType,
                    timestamp: new Date().toISOString(),
                    result: {
                      ok: false,
                      message: err instanceof Error ? err.message : 'Action failed',
                    },
                  },
                }
              : msg,
          ),
        )
      })
    },
    [shellContext, chatApi, setMessages],
  )
}
