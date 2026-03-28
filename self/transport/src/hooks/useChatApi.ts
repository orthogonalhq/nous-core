import { useMemo } from 'react'
import { trpc } from '../client'

export interface UseChatApiOptions {
  projectId?: string
}

/** Matches the ChatAPI interface from @nous/ui/panels (structural compatibility). */
interface ChatApiShape {
  send: (message: string) => Promise<{ response: string; traceId: string }>
  getHistory: () => Promise<{ role: 'user' | 'assistant'; content: string; timestamp: string }[]>
}

/**
 * Unified tRPC-backed ChatAPI hook.
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

  return useMemo(
    () => ({
      send: async (message: string) => {
        const result = await sendMessage.mutateAsync(
          projectId ? { message, projectId } : { message },
        )
        if (projectId) {
          await utils.chat.getHistory.invalidate({ projectId })
        }
        return { response: result.response, traceId: result.traceId }
      },
      getHistory: async () => {
        const data = await utils.chat.getHistory.fetch(
          projectId ? { projectId } : {},
        )
        return (data?.entries ?? [])
          .filter((e: any) => e.role === 'user' || e.role === 'assistant')
          .map((e: any) => ({
            role: e.role as 'user' | 'assistant',
            content: e.content,
            timestamp: e.timestamp,
          }))
      },
    }),
    projectId ? [projectId, sendMessage, utils] : [sendMessage, utils],
  )
}
