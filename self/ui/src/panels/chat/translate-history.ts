/**
 * SP 1.9 Item 1 — translate STM-shaped chat history entries into UI-side
 * `ChatMessage[]`. Mirrors the inline mapping at
 * `self/transport/src/hooks/useChatApi.ts:67-83` (Option X — duplication
 * preserves Invariant E literally; the legacy imperative wrapper retains
 * its in-line form). A future sub-phase can refactor `useChatApi.getHistory`
 * to import from this module so the "one source of truth" SDS spirit is
 * realized in code (recorded as forward-trace in SP 1.9 Completion Report).
 *
 * Pure function. Filters to user/assistant entries only; spreads the four
 * metadata fields the UI consumes.
 */
import type { ChatMessage } from './types'

interface RawHistoryEntry {
  role: string
  content: string
  timestamp: string
  /** STM does not currently store traceId on entries; if a future writer
   *  adds it (e.g., on the welcome turn or on assistant completions), it
   *  flows through to ChatMessage so inline-thought-group anchoring can
   *  attach. Optional; absence is non-failure. */
  traceId?: string
  metadata?: {
    contentType?: 'text' | 'openui'
    thinkingContent?: string
    actionOutcome?: { actionType: string; label: string; timestamp: string; result?: ChatMessage['actionOutcome'] extends infer T ? T extends { result?: infer R } ? R : never : never }
    cards?: Array<{ type: string; props: Record<string, unknown> }>
    traceId?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function translateHistoryEntries(
  entries: readonly RawHistoryEntry[],
): ChatMessage[] {
  return entries
    .filter((e) => e.role === 'user' || e.role === 'assistant')
    .map((e) => {
      // Prefer top-level `traceId`; fall back to `metadata.traceId` if a
      // STM writer puts it there. Both branches are non-failure when
      // absent.
      const traceId = e.traceId ?? e.metadata?.traceId
      return {
        role: e.role as 'user' | 'assistant',
        content: e.content,
        timestamp: e.timestamp,
        ...(traceId ? { traceId } : {}),
        ...(e.metadata?.contentType ? { contentType: e.metadata.contentType } : {}),
        ...(e.metadata?.thinkingContent ? { thinkingContent: e.metadata.thinkingContent } : {}),
        ...(e.metadata?.actionOutcome
          ? { actionOutcome: e.metadata.actionOutcome as ChatMessage['actionOutcome'] }
          : {}),
        ...(e.metadata?.cards ? { cards: e.metadata.cards } : {}),
      }
    })
}
