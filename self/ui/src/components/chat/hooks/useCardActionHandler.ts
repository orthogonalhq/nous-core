import { useCallback, useContext } from 'react'
import { ShellContext } from '../../shell/ShellContext'
import type { CardAction } from '../openui-adapter/types'
import type { ChatMessage, ActionResult } from '../../../panels/ChatPanel'
import {
  overlayKeyForCardOutcome,
  type LocalOverlayEntry,
} from '../../../panels/chat/merge-overlay'

export interface UseCardActionHandlerOptions {
  chatApi: {
    sendAction?: (action: CardAction) => Promise<ActionResult>
  }
  /**
   * SP 1.9 Item 1 — local overlay reducer setter. The card-outcome dispatch
   * pushes a `{ kind: 'card-outcome', ... }` entry; `mergeHistoryWithOverlay`
   * shallow-merges `actionOutcome` onto the matching server entry at render
   * time. Replaces the SP 1.8 `setMessages` parallel-list mutation
   * (Invariant H — old path deleted in same PR).
   */
  setLocalOverlay: React.Dispatch<React.SetStateAction<readonly LocalOverlayEntry[]>>
  /**
   * Snapshot of currently-rendered messages — used to look up the target
   * entry's `traceId` for the overlay key (with `idx-${i}` fallback for
   * pre-traceId messages).
   */
  messages: readonly ChatMessage[]
}

/**
 * Hook that returns a handler for card action events.
 *
 * - `navigate` actions are handled client-side via shell context `navigate()`
 * - All other action types are dispatched via `chatApi.sendAction()`
 * - On dispatch resolution, pushes a `card-outcome` overlay entry that the
 *   merge helper applies onto the originating message at render time
 *   (transitions the card to stale state).
 *
 * SP 1.9 Item 1 ratified — Invariant D sole-overlay mechanism.
 *
 * Gracefully handles absence of ShellProvider — navigate actions become no-ops.
 */
export function useCardActionHandler({ chatApi, setLocalOverlay, messages }: UseCardActionHandlerOptions) {
  const shellContext = useContext(ShellContext)

  return useCallback(
    (action: CardAction, messageIndex: number) => {
      if (action.actionType === 'navigate') {
        const { panel, ...params } = action.payload as Record<string, unknown>
        shellContext?.navigate(String(panel), Object.keys(params).length > 0 ? params : undefined)
        return
      }

      if (!chatApi.sendAction) return

      const target = messages[messageIndex]
      const traceId = target?.traceId
      const overlayKey = overlayKeyForCardOutcome(traceId, messageIndex, action.actionType)
      const traceIdOrIndexKey = traceId ?? `idx-${messageIndex}`

      chatApi.sendAction(action).then((result) => {
        setLocalOverlay((prev) => [
          ...prev,
          {
            kind: 'card-outcome',
            traceIdOrIndexKey,
            key: overlayKey,
            issuedAt: Date.now(),
            actionOutcome: {
              actionType: action.actionType,
              label: action.actionType,
              timestamp: new Date().toISOString(),
              result,
            },
          },
        ])
      }).catch((err) => {
        setLocalOverlay((prev) => [
          ...prev,
          {
            kind: 'card-outcome',
            traceIdOrIndexKey,
            key: overlayKey,
            issuedAt: Date.now(),
            actionOutcome: {
              actionType: action.actionType,
              label: action.actionType,
              timestamp: new Date().toISOString(),
              result: {
                ok: false,
                message: err instanceof Error ? err.message : 'Action failed',
              },
            },
          },
        ])
      })
    },
    [shellContext, chatApi, setLocalOverlay, messages],
  )
}
