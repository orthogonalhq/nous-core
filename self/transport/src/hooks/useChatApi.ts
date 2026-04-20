import { useMemo, useRef } from 'react'
import { trpc } from '../client'
import type { CardAction, ActionResult } from '@nous/shared'

export interface UseChatApiOptions {
  projectId?: string
  sessionId?: string
}

/** Matches the ChatAPI interface from @nous/ui/panels (structural compatibility). */
interface ChatApiShape {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui'; thinkingContent?: string; cards?: Array<{ type: string; props: Record<string, unknown> }> }>
  getHistory: () => Promise<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    contentType?: 'text' | 'openui'
    thinkingContent?: string
    actionOutcome?: { actionType: string; label: string; timestamp: string }
  }[]>
  sendAction: (action: CardAction) => Promise<ActionResult>
}

/**
 * Unified tRPC-backed ChatAPI hook.
 *
 * Returns a **referentially stable** ChatAPI object. The object identity only
 * changes when `projectId` changes, preventing downstream `useEffect` hooks
 * (e.g. ChatPanel's history fetch) from re-firing on every render.
 *
 * - Without `projectId`: passes `{}` to `getHistory`, no cache invalidation
 *   after send (desktop behavior).
 * - With `projectId`: passes `projectId` to both `sendMessage` and
 *   `getHistory`, and invalidates `chat.getHistory` cache after successful
 *   send (web behavior).
 */
export function useChatApi(options?: UseChatApiOptions): ChatApiShape {
  const projectId = options?.projectId
  const sessionId = options?.sessionId
  const utils = trpc.useUtils()
  const sendMessage = trpc.chat.sendMessage.useMutation()
  const sendActionMutation = trpc.chat.sendAction.useMutation()

  // Store unstable references so the useMemo closure always calls the latest
  // mutateAsync / utils without needing them as dependencies.
  const sendRef = useRef(sendMessage.mutateAsync)
  sendRef.current = sendMessage.mutateAsync
  const sendActionRef = useRef(sendActionMutation.mutateAsync)
  sendActionRef.current = sendActionMutation.mutateAsync
  const utilsRef = useRef(utils)
  utilsRef.current = utils

  return useMemo(
    () => ({
      send: async (message: string) => {
        const input: Record<string, unknown> = { message }
        if (projectId) input.projectId = projectId
        if (sessionId) input.sessionId = sessionId
        const result = await sendRef.current(input as any)
        if (projectId) {
          await utilsRef.current.chat.getHistory.invalidate(
            sessionId ? { projectId, sessionId } : { projectId },
          )
        }
        return { response: result.response, traceId: result.traceId, contentType: result.contentType, thinkingContent: result.thinkingContent, cards: result.cards }
      },
      getHistory: async () => {
        const params: Record<string, string> = {}
        if (projectId) params.projectId = projectId
        if (sessionId) params.sessionId = sessionId
        const data = await utilsRef.current.chat.getHistory.fetch(params as any)
        return (data?.entries ?? [])
          .filter((e: any) => e.role === 'user' || e.role === 'assistant')
          .map((e: any) => ({
            role: e.role as 'user' | 'assistant',
            content: e.content,
            timestamp: e.timestamp,
            ...(e.metadata?.contentType ? { contentType: e.metadata.contentType as 'text' | 'openui' } : {}),
            ...(e.metadata?.thinkingContent ? { thinkingContent: e.metadata.thinkingContent as string } : {}),
            ...(e.metadata?.actionOutcome ? { actionOutcome: e.metadata.actionOutcome as { actionType: string; label: string; timestamp: string } } : {}),
            ...(e.metadata?.cards ? { cards: e.metadata.cards as Array<{ type: string; props: Record<string, unknown> }> } : {}),
          }))
      },
      sendAction: async (action: CardAction) => {
        const input: Record<string, unknown> = { action }
        if (projectId) input.projectId = projectId
        if (sessionId) input.sessionId = sessionId
        const result = await sendActionRef.current(input as any)
        return result as ActionResult
      },
    }),
    // Only recompute when the logical identity changes (projectId or sessionId).
    // sendMessage and utils are accessed via refs for latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, sessionId],
  )
}
