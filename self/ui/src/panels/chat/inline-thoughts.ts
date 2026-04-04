import type { ThoughtEvent } from '../../components/thought'
import type { ThoughtPfcDecisionPayload, ThoughtTurnLifecyclePayload } from '@nous/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InlineThoughtItem {
  text: string
  traceId: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Q5 — Event filter: only surface prose-style items
//   gateway-run started  → "Thinking…"
//   PFC tool-execution   → "Using [tool name]"
//   PFC reflection       → "Reflecting…"
//   turn-complete        → "Done"
//   Everything else      → suppressed
// ---------------------------------------------------------------------------

export function formatThoughtEvent(event: ThoughtEvent): InlineThoughtItem | null {
  if (event.channel === 'thought:turn-lifecycle') {
    const p = event.payload as ThoughtTurnLifecyclePayload
    if (p.phase === 'gateway-run' && p.status === 'started') {
      return { text: 'Thinking\u2026', traceId: p.traceId, timestamp: p.emittedAt }
    }
    if (p.phase === 'turn-complete') {
      return { text: 'Done', traceId: p.traceId, timestamp: p.emittedAt }
    }
    return null
  }

  if (event.channel === 'thought:pfc-decision') {
    const p = event.payload as ThoughtPfcDecisionPayload
    if (p.thoughtType === 'tool-execution') {
      const toolName = extractToolName(p.content)
      return { text: `Using ${toolName}`, traceId: p.traceId, timestamp: p.emittedAt }
    }
    if (p.thoughtType === 'reflection') {
      return { text: 'Reflecting\u2026', traceId: p.traceId, timestamp: p.emittedAt }
    }
    return null
  }

  return null
}

/** Best-effort tool name extraction from PFC content string. */
function extractToolName(content: string): string {
  const match = content.match(/tool[=:\s]+(\S+)/i)
  return match?.[1] ?? 'tool'
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export function groupThoughtsByTrace(
  items: InlineThoughtItem[],
): Map<string, InlineThoughtItem[]> {
  const map = new Map<string, InlineThoughtItem[]>()
  for (const item of items) {
    let group = map.get(item.traceId)
    if (!group) {
      group = []
      map.set(item.traceId, group)
    }
    group.push(item)
  }
  return map
}

/**
 * Derive the "active" traceId — the most recent trace that has inline thoughts
 * but no matching assistant message yet.
 */
export function deriveActiveTraceId(
  items: InlineThoughtItem[],
  assistantTraceIds: Set<string>,
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const traceId = items[i].traceId
    if (!assistantTraceIds.has(traceId)) return traceId
  }
  return null
}
