// SP 1.9 Plan Task #19 — Axis C case 1 (five sub-cases) for the
// `mergeHistoryWithOverlay` pure helper. Pure-function unit coverage —
// no React, no trpc, no ChatPanel render.
import { describe, expect, it } from 'vitest'
import {
  mergeHistoryWithOverlay,
  overlayKeyForCardOutcome,
  overlayKeyForOptimisticSend,
  type LocalOverlayEntry,
} from '../chat/merge-overlay'
import type { ChatMessage } from '../chat/types'

const T = '2026-04-25T00:00:00.000Z'

function userMsg(content: string, t = T): ChatMessage {
  return { role: 'user', content, timestamp: t }
}

function assistantMsg(content: string, t = T, traceId?: string): ChatMessage {
  return { role: 'assistant', content, timestamp: t, ...(traceId ? { traceId } : {}) }
}

describe('SP 1.9 — mergeHistoryWithOverlay (Axis C case 1)', () => {
  // 1.a — empty overlay passes server entries through unchanged.
  it('1a: empty overlay returns server entries unchanged', () => {
    const server = [userMsg('hi'), assistantMsg('hello')]
    expect(mergeHistoryWithOverlay(server, [])).toEqual(server)
  });

  // 1.b — optimistic-send with no matching server entry is appended at end.
  it('1b: optimistic-send with no server match is appended', () => {
    const server = [assistantMsg('hello', T)]
    const u = userMsg('hi', '2026-04-25T00:00:05.000Z')
    const overlay: LocalOverlayEntry[] = [
      {
        kind: 'optimistic-send',
        message: u,
        key: overlayKeyForOptimisticSend(u),
        issuedAt: Date.now(),
      },
    ]
    const merged = mergeHistoryWithOverlay(server, overlay)
    expect(merged).toHaveLength(2)
    expect(merged[1]).toEqual(u)
  });

  // 1.c — optimistic-send matched (within ±10s window) is dropped.
  it('1c: optimistic-send matched within 10s is dropped (dedup)', () => {
    const u = userMsg('hi', '2026-04-25T00:00:00.000Z')
    const serverEcho = userMsg('hi', '2026-04-25T00:00:03.000Z')
    const server = [serverEcho]
    const overlay: LocalOverlayEntry[] = [
      {
        kind: 'optimistic-send',
        message: u,
        key: overlayKeyForOptimisticSend(u),
        issuedAt: Date.now(),
      },
    ]
    const merged = mergeHistoryWithOverlay(server, overlay)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(serverEcho)
  });

  // 1.d — card-outcome matched by traceId shallow-merges actionOutcome.
  it('1d: card-outcome matched by traceId shallow-merges actionOutcome', () => {
    const a = assistantMsg('<Card />', T, 't1')
    const server = [a]
    const overlay: LocalOverlayEntry[] = [
      {
        kind: 'card-outcome',
        traceIdOrIndexKey: 't1',
        key: overlayKeyForCardOutcome('t1', 0, 'approve'),
        issuedAt: Date.now(),
        actionOutcome: {
          actionType: 'approve',
          label: 'approve',
          timestamp: T,
        },
      },
    ]
    const merged = mergeHistoryWithOverlay(server, overlay)
    expect(merged).toHaveLength(1)
    expect(merged[0].actionOutcome).toBeDefined()
    expect(merged[0].actionOutcome?.actionType).toBe('approve')
    // Other fields preserved.
    expect(merged[0].content).toBe('<Card />')
    expect(merged[0].traceId).toBe('t1')
  });

  // 1.e — card-outcome unmatched (no traceId match) is ignored, server
  // entries unchanged. The overlay survives in the input but is invisible
  // in the output (the helper only modifies entries that match).
  it('1e: card-outcome unmatched traceId is ignored — server entries unchanged', () => {
    const a = assistantMsg('<Card />', T, 't1')
    const server = [a]
    const overlay: LocalOverlayEntry[] = [
      {
        kind: 'card-outcome',
        traceIdOrIndexKey: 't-NEVER',
        key: 't-NEVER:reject',
        issuedAt: Date.now(),
        actionOutcome: {
          actionType: 'reject',
          label: 'reject',
          timestamp: T,
        },
      },
    ]
    const merged = mergeHistoryWithOverlay(server, overlay)
    expect(merged).toHaveLength(1)
    expect(merged[0].actionOutcome).toBeUndefined()
  });

  // Tier 3 — pre-traceId fallback: server entry without traceId matches
  // overlay entry keyed by `idx-${i}`.
  it('1f: card-outcome matches server entry by idx-${i} fallback when no traceId', () => {
    const server = [assistantMsg('first', T), assistantMsg('<Card />', T)]
    const overlay: LocalOverlayEntry[] = [
      {
        kind: 'card-outcome',
        traceIdOrIndexKey: 'idx-1',
        key: 'idx-1:approve',
        issuedAt: Date.now(),
        actionOutcome: {
          actionType: 'approve',
          label: 'approve',
          timestamp: T,
        },
      },
    ]
    const merged = mergeHistoryWithOverlay(server, overlay)
    expect(merged[0].actionOutcome).toBeUndefined()
    expect(merged[1].actionOutcome?.actionType).toBe('approve')
  });
});

describe('SP 1.9 — overlayKeyFor* helpers (Axis C)', () => {
  it('overlayKeyForOptimisticSend uses role:content:timestamp', () => {
    expect(overlayKeyForOptimisticSend(userMsg('hi'))).toBe(`user:hi:${T}`)
  });

  it('overlayKeyForCardOutcome uses traceId when present', () => {
    expect(overlayKeyForCardOutcome('t1', 5, 'approve')).toBe('t1:approve')
  });

  it('overlayKeyForCardOutcome falls back to idx-${i} when traceId absent', () => {
    expect(overlayKeyForCardOutcome(undefined, 5, 'approve')).toBe('idx-5:approve')
  });
});
