/**
 * SP 1.9 Item 1 — shared `@nous/transport` mock surface for ChatPanel
 * test files. The SP 1.9 Plan Task #14 migration replaced ChatPanel's
 * imperative `chatApi.getHistory()` fetch with a `trpc.chat.getHistory.
 * useQuery` subscription, so any test that renders ChatPanel must mock
 * the `trpc` react-client surface to avoid the "Did you forget to wrap
 * your App inside `withTRPC` HoC?" runtime error.
 *
 * Usage (per-file):
 *
 *   import { vi } from 'vitest'
 *   import { makeTrpcMock, setMockHistoryEntries } from './chat-panel-trpc-mock'
 *
 *   vi.mock('@nous/transport', () => makeTrpcMock())
 *
 *   beforeEach(() => setMockHistoryEntries([]))   // reset between tests
 *
 *   // To pre-populate ChatPanel's rendered history:
 *   setMockHistoryEntries([
 *     { role: 'user', content: 'Hi', timestamp: '2026-04-25T00:00:00Z' },
 *   ])
 *
 * The mock surfaces:
 *   - `useEventSubscription` — no-op pass-through (tests that need event
 *      delivery override this themselves; see ChatPanel.thought-stream.test
 *      for the pattern).
 *   - `trpc.chat.getHistory.useQuery` — returns `{ data: { entries }, ... }`
 *      from the latest `setMockHistoryEntries(...)` call.
 *   - `trpc.useUtils().chat.getHistory.invalidate/fetch` — vi.fn stubs.
 *   - `trpc.chat.{sendMessage,sendAction,fireWelcomeIfUnsent}.useMutation`
 *      — returns vi.fn-shaped `{ mutateAsync }` stubs.
 */
import { vi } from 'vitest'
import type { ChatMessage } from '../ChatPanel'

let mockEntries: Array<Record<string, unknown>> = []
// Cached `data` shape — re-created only when `setMockHistoryEntries` is
// called. Stable reference equality across `useQuery` invocations within
// the same test prevents an infinite re-render loop in the prune useEffect
// (which depends on `serverEntries` derived from `historyQuery.data`).
let mockData: { entries: Array<Record<string, unknown>> } = { entries: mockEntries }

export function setMockHistoryEntries(entries: Array<Record<string, unknown>>): void {
  mockEntries = entries
  mockData = { entries }
}

/**
 * Helper to translate a `ChatMessage[]` into raw STM-shaped entries that
 * `translateHistoryEntries` will re-derive into the same `ChatMessage[]`.
 * Lets test fixtures that historically passed messages via `chatApi.getHistory()`
 * be ported with minimal change: replace `getHistory: async () => msgs` with
 * `setMockHistoryFromChatMessages(msgs)`.
 */
export function setMockHistoryFromChatMessages(messages: ChatMessage[]): void {
  setMockHistoryEntries(
    messages.map((m) => {
      const metadata: Record<string, unknown> = {}
      if (m.contentType !== undefined) metadata.contentType = m.contentType
      if (m.thinkingContent !== undefined) metadata.thinkingContent = m.thinkingContent
      if (m.actionOutcome !== undefined) metadata.actionOutcome = m.actionOutcome
      if (m.cards !== undefined) metadata.cards = m.cards
      const entry: Record<string, unknown> = {
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }
      if (m.traceId !== undefined) entry.traceId = m.traceId
      if (Object.keys(metadata).length > 0) entry.metadata = metadata
      return entry
    }),
  )
}

export function makeTrpcMock(extras?: Record<string, unknown>): Record<string, unknown> {
  return {
    useEventSubscription: () => undefined,
    useChatApi: () => ({
      send: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      sendAction: vi.fn(),
    }),
    trpc: {
      useUtils: () => ({
        chat: {
          getHistory: {
            invalidate: vi.fn().mockResolvedValue(undefined),
            fetch: vi.fn().mockResolvedValue({ entries: mockEntries }),
          },
        },
      }),
      // Other routers consumed by ChatPanel descendants (e.g.,
      // ThoughtSummary calls `trpc.traces.get.useQuery` — without this
      // stub the descendant render throws "Cannot read properties of
      // undefined" at the trpc.traces lookup).
      traces: {
        get: {
          useQuery: () => ({ data: null, isLoading: false, isError: false }),
        },
      },
      chat: {
        getHistory: {
          useQuery: () => ({
            data: mockData,
            isSuccess: true,
            isError: false,
            isLoading: false,
            isFetching: false,
            refetch: vi.fn().mockResolvedValue(undefined),
          }),
        },
        sendMessage: {
          useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
        },
        sendAction: {
          useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({}) }),
        },
        fireWelcomeIfUnsent: {
          useMutation: () => ({ mutateAsync: vi.fn().mockResolvedValue({ welcomeFired: false, reason: 'no_project_id' }) }),
        },
      },
      ...(extras ?? {}),
    },
  }
}
