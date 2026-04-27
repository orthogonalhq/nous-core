/**
 * SP 1.9 Item 1 — local overlay reducer for ChatPanel.
 *
 * `LocalOverlayEntry` is a UI-only record for state not yet reflected in
 * `historyQuery.data` (`trpc.chat.getHistory.useQuery` consumer). Two
 * kinds:
 *
 *   - `'optimistic-send'`: instantly-rendered user-message (or error-on-send
 *     assistant message) that the server has not yet acknowledged. Pruned
 *     from the overlay when a matching server entry appears (content + role
 *     + ±10s timestamp window).
 *
 *   - `'card-outcome'`: card action result (approve / reject / followup)
 *     applied to an existing assistant message via shallow-merge of
 *     `actionOutcome`. Survives in the overlay until the server delivers
 *     a refreshed history that already contains the merged outcome (or the
 *     panel unmounts).
 *
 * Sole-mechanism contract — Invariant D (SDS § 0 Note 8 / Goals C8 / C9):
 * neither optimistic-send nor card-action bypasses this overlay. ChatPanel
 * does NOT keep a parallel `useState<ChatMessage[]>` list.
 */
import type { ChatMessage } from './types'

/** Overlay TTL window for optimistic-send dedup (matches send-path latency). */
const OPTIMISTIC_DEDUP_WINDOW_MS = 10_000

export type LocalOverlayEntry =
  | {
      readonly kind: 'optimistic-send'
      readonly message: ChatMessage
      readonly key: string
      readonly issuedAt: number
    }
  | {
      readonly kind: 'card-outcome'
      readonly traceIdOrIndexKey: string
      readonly key: string
      readonly issuedAt: number
      readonly actionOutcome: NonNullable<ChatMessage['actionOutcome']>
    }

/**
 * SP 1.9 Item 1 — derive the canonical key for an optimistic-send overlay
 * entry. Used as the dedup discriminant against server entries.
 */
export function overlayKeyForOptimisticSend(msg: ChatMessage): string {
  return `${msg.role}:${msg.content}:${msg.timestamp}`
}

/**
 * SP 1.9 Item 1 — derive the canonical key for a card-outcome overlay
 * entry. Pre-traceId messages use the `idx-${messageIndex}` fallback so
 * the merge helper can match by positional index when the server entry
 * has no traceId.
 */
export function overlayKeyForCardOutcome(
  traceId: string | undefined,
  messageIndex: number,
  actionType: string,
): string {
  const idKey = traceId ?? `idx-${messageIndex}`
  return `${idKey}:${actionType}`
}

/**
 * SP 1.9 Item 1 — merge server-derived chat history with the local overlay.
 *
 * Pure function. Returns a new `ChatMessage[]` where:
 *
 *   - Each `serverEntries[i]` is preserved as-is, except that any
 *     `card-outcome` overlay entry whose `traceIdOrIndexKey` matches the
 *     server entry's `traceId` (or the `idx-${i}` fallback) shallow-merges
 *     its `actionOutcome` onto the server entry.
 *
 *   - Each `optimistic-send` overlay entry whose key matches a server
 *     entry's `overlayKeyForOptimisticSend(...)` value within the
 *     `OPTIMISTIC_DEDUP_WINDOW_MS` window is dropped (server-acknowledged).
 *
 *   - Remaining `optimistic-send` overlay entries are appended at the end
 *     in `issuedAt` order.
 *
 *   - Unmatched `card-outcome` entries are NOT appended (they only modify
 *     existing entries — if the matching server entry is absent, the
 *     outcome is invisible until the entry arrives).
 */
export function mergeHistoryWithOverlay(
  serverEntries: readonly ChatMessage[],
  overlay: readonly LocalOverlayEntry[],
): ChatMessage[] {
  // Index card-outcome entries by their traceIdOrIndexKey for fast lookup.
  const cardOutcomeByKey = new Map<string, NonNullable<ChatMessage['actionOutcome']>>()
  for (const o of overlay) {
    if (o.kind === 'card-outcome') {
      cardOutcomeByKey.set(o.traceIdOrIndexKey, o.actionOutcome)
    }
  }

  // Build the merged list: server entries first, with card-outcome merges.
  const merged: ChatMessage[] = serverEntries.map((entry, i) => {
    const idKey = entry.traceId ?? `idx-${i}`
    const outcome = cardOutcomeByKey.get(idKey)
    if (outcome != null) {
      return { ...entry, actionOutcome: outcome }
    }
    return entry
  })

  // Append optimistic-send entries that have no matching server entry
  // within the dedup window.
  for (const o of overlay) {
    if (o.kind !== 'optimistic-send') continue
    const matched = serverEntries.some(
      (e) =>
        e.role === o.message.role &&
        e.content === o.message.content &&
        Math.abs(Date.parse(e.timestamp) - Date.parse(o.message.timestamp)) <
          OPTIMISTIC_DEDUP_WINDOW_MS,
    )
    if (!matched) merged.push(o.message)
  }

  return merged
}

export { OPTIMISTIC_DEDUP_WINDOW_MS }
