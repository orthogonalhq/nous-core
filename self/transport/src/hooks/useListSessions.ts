import { trpc } from '../client'

export interface ChatSession {
  sessionId: string
  scope: string
  firstMessage: string
  lastTimestamp: string
}

/**
 * Query hook for chat session list.
 *
 * When `projectId` is provided, returns sessions scoped to that project.
 * When absent, query is disabled (orphan session storage requires WR-165).
 */
export function useListSessions(projectId?: string) {
  return trpc.chat.listSessions.useQuery(
    { projectId },
    { enabled: !!projectId },
  )
}
