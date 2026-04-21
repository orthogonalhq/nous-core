/**
 * SP 1.6 — Wizard → workspace → chat init E2E (T22-T23 per SDS § 9.5).
 *
 * Bounded scope (SDS § 9.8): mock the gateway runtime, mock the welcome
 * mutation, mock `useChatApi`'s history fetch. Drive the renderer through
 * the workspace mount that registers `DesktopChatPanel` as the dockview
 * `chat` panel; assert the welcome mutation fires once, and that a
 * subsequent `getHistory` returns the welcome turn rendered with the
 * standard agent-message shape.
 *
 * Why we mount `DesktopChatPanel` directly (instead of the full `App`):
 * the SDS § 0 Note 1 delegate is `DesktopChatPanel`; the resilience
 * invariant that matters is "the welcome fires when the principal chat
 * panel mounts", which is observable at this seam. The full `App` mount
 * adds wizard plumbing + dockview state already covered by the SP 1.5
 * carry-forward `App.test.tsx` (and would re-exercise pre-existing
 * baseline failures unrelated to SP 1.6 per Goals C22).
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WELCOME_TEXT = 'Hello — happy to help.'

const mutateAsyncMock = vi.hoisted(() => vi.fn())
const useShellContextMock = vi.hoisted(() => vi.fn(() => ({ activeProjectId: PROJECT_ID })))
const useChatApiMock = vi.hoisted(() => vi.fn())

vi.mock('@nous/ui/panels', () => ({
  // Render history entries as plain text rows so T23 can assert the
  // welcome surfaces with the standard shape (no welcome-specific row).
  ChatPanel: ({ params }: { params: { chatApi?: { getHistory?: () => Promise<{ entries: Array<{ role: string; content: string }> }> } } }) => {
    return (
      <div data-testid="chat-panel">
        <button
          data-testid="load-history"
          onClick={async () => {
            const ctx = await params.chatApi?.getHistory?.()
            const root = document.querySelector('[data-testid="history"]')
            if (root && ctx) {
              root.innerHTML = ctx.entries
                .map(
                  (e) =>
                    `<div data-role="${e.role}" data-testid="agent-row">${e.content}</div>`,
                )
                .join('')
            }
          }}
        >
          load
        </button>
        <div data-testid="history" />
      </div>
    )
  },
}))

vi.mock('@nous/ui/components', () => ({
  ChatSurface: () => <div data-testid="chat-surface">surface</div>,
  useShellContext: useShellContextMock,
}))

vi.mock('@nous/transport', () => ({
  useChatApi: useChatApiMock,
  trpc: {
    chat: {
      fireWelcomeIfUnsent: {
        useMutation: () => ({ mutateAsync: mutateAsyncMock }),
      },
    },
    config: {
      // SP 1.9 BT R3 — persisted gate query. Initial mount sees `false`
      // so the trigger fires; the post-success invalidation is a no-op
      // in tests (mutateAsync settles before the next render observes
      // a refetch).
      getWelcomeMessageSent: {
        useQuery: () => ({ data: false }),
      },
    },
    useUtils: () => ({
      config: {
        getWelcomeMessageSent: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
      chat: {
        getHistory: { invalidate: vi.fn().mockResolvedValue(undefined) },
      },
    }),
  },
}))

import { ConnectedChatSurface, DesktopChatPanel } from '../desktop-chat-wrappers'

function makeProps(): Parameters<typeof DesktopChatPanel>[0] {
  return {} as Parameters<typeof DesktopChatPanel>[0]
}

describe('SP 1.6 — wizard → workspace → chat init E2E', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' })
    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_ID })
    useChatApiMock.mockReturnValue({
      getHistory: vi.fn().mockResolvedValue({
        entries: [
          { role: 'assistant', content: WELCOME_TEXT, timestamp: '2026-04-18T12:00:00.000Z' },
        ],
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // T22 — Wizard complete → workspace mount → chat panel mount → welcome fires.
  // The "wizard complete → workspace mount" hand-off is the App.tsx
  // `handleWizardComplete` setter chain (`setPhase('main')` → dockview
  // mounts the registered `chat` panel). Per SDS § 0 Note 1, the welcome
  // fires when `DesktopChatPanel` mounts. This test asserts that mount
  // boundary directly: rendering the panel triggers exactly one welcome
  // mutation with the active project ID.
  it('T22 mounting DesktopChatPanel (post-wizard workspace mount) fires the welcome mutation once', () => {
    render(<DesktopChatPanel {...makeProps()} />)

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_ID })
  })

  // T23 — Welcome appears in chat history on next history fetch with the
  // standard agent-message shape (role: 'assistant'; no welcome badge or
  // bespoke metadata). Verifies Goals C9 / C10 at the renderer seam.
  // SP 1.8 Plan Task #17 — End-to-end welcome-fires-in-simple-mode test
  // (Goals C15 / Issue 3 closure). Mounts `ConnectedChatSurface` (the
  // simple-mode shell's chat surface) under the post-wizard workspace
  // harness with a non-null `activeProjectId`; asserts the welcome
  // mutation fires exactly once via the shared `useFireWelcomeOnMount`
  // hook. Symmetric to T22 for the dockview path.
  it('T22b (SP 1.8) — mounting ConnectedChatSurface (simple-mode chat) fires the welcome mutation once', async () => {
    render(<ConnectedChatSurface />)
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_ID })
  })

  it('T23 welcome surfaces in chat history with the standard assistant-row shape', async () => {
    const { getByTestId } = render(<DesktopChatPanel {...makeProps()} />)

    // Trigger the history load (simulated post-welcome history fetch).
    const button = getByTestId('load-history') as HTMLButtonElement
    button.click()
    await new Promise((r) => setTimeout(r, 0))

    const rows = document.querySelectorAll('[data-testid="agent-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const first = rows[0] as HTMLElement
    expect(first.getAttribute('data-role')).toBe('assistant')
    expect(first.textContent).toBe(WELCOME_TEXT)
    // No welcome-specific attribute on the rendered row (Goals C9):
    expect(first.getAttribute('data-welcome')).toBeNull()
  })
})
