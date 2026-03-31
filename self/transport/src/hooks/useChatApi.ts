import { useMemo, useRef } from 'react'
import { trpc } from '../client'

export interface UseChatApiOptions {
  projectId?: string
}

/** Matches the ChatAPI interface from @nous/ui/panels (structural compatibility). */
interface ChatApiShape {
  send: (message: string) => Promise<{ response: string; traceId: string; contentType?: 'text' | 'openui' }>
  getHistory: () => Promise<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    contentType?: 'text' | 'openui'
    actionOutcome?: { actionType: string; label: string; timestamp: string }
  }[]>
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
  const utils = trpc.useUtils()
  const sendMessage = trpc.chat.sendMessage.useMutation()

  // Store unstable references so the useMemo closure always calls the latest
  // mutateAsync / utils without needing them as dependencies.
  const sendRef = useRef(sendMessage.mutateAsync)
  sendRef.current = sendMessage.mutateAsync
  const utilsRef = useRef(utils)
  utilsRef.current = utils

  return useMemo(
    () => ({
      send: async (message: string) => {
        const result = await sendRef.current(
          projectId ? { message, projectId } : { message },
        )
        if (projectId) {
          await utilsRef.current.chat.getHistory.invalidate({ projectId })
        }
        return { response: result.response, traceId: result.traceId, contentType: result.contentType }
      },
      getHistory: async () => {
        const data = await utilsRef.current.chat.getHistory.fetch(
          projectId ? { projectId } : {},
        )
        return (data?.entries ?? [])
          .filter((e: any) => e.role === 'user' || e.role === 'assistant')
          .map((e: any) => ({
            role: e.role as 'user' | 'assistant',
            content: e.content,
            timestamp: e.timestamp,
            ...(e.metadata?.contentType ? { contentType: e.metadata.contentType as 'text' | 'openui' } : {}),
            ...(e.metadata?.actionOutcome ? { actionOutcome: e.metadata.actionOutcome as { actionType: string; label: string; timestamp: string } } : {}),
          }))
      },
    }),
    // Only recompute when the logical identity changes (projectId).
    // sendMessage and utils are accessed via refs for latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  )
}
