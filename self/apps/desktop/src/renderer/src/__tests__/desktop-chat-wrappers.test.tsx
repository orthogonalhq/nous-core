/**
 * SP 1.6 — DesktopChatPanel renderer wrapper Tier-1 contract tests
 * (T14-T19). Asserts mount-once mutation invocation, StrictMode resilience,
 * empty-deps `useEffect` (no re-fire on prop / activeProjectId change), and
 * non-blocking failure handling.
 */
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Mocks for renderer-side dependencies. The renderer wrapper imports
// `@nous/ui/panels`, `@nous/ui/components`, and `@nous/transport`.
const mutateAsyncMock = vi.hoisted(() => vi.fn())
const useShellContextMock = vi.hoisted(() => vi.fn(() => ({ activeProjectId: PROJECT_A })))
const useChatApiMock = vi.hoisted(() => vi.fn(() => ({})))

vi.mock('@nous/ui/panels', () => ({
  ChatPanel: ({ params }: { params: unknown }) => (
    <div data-testid="chat-panel" data-chatapi={String(Boolean(params))}>chat panel</div>
  ),
}))

vi.mock('@nous/ui/components', () => ({
  ChatSurface: () => <div data-testid="chat-surface">chat surface</div>,
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
  },
}))

import { DesktopChatPanel } from '../desktop-chat-wrappers'

function makeProps(): Parameters<typeof DesktopChatPanel>[0] {
  return {} as Parameters<typeof DesktopChatPanel>[0]
}

describe('DesktopChatPanel — welcome trigger (SP 1.6)', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' })
    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_A })
    useChatApiMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // T14 — Mount-once: mutation invoked exactly once on first mount.
  it('T14 fires the welcome mutation exactly once on first mount with the active projectId', () => {
    render(<DesktopChatPanel {...makeProps()} />)

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_A })
  })

  // T15 — StrictMode-resilient: double-invoke effect does not double-fire.
  it('T15 StrictMode double-invokes the effect but the useRef guard prevents double-fire', () => {
    render(
      <StrictMode>
        <DesktopChatPanel {...makeProps()} />
      </StrictMode>,
    )

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  // T16 — Re-render does not re-fire.
  it('T16 re-rendering with new props does not re-fire the mutation', () => {
    const { rerender } = render(<DesktopChatPanel {...makeProps()} />)
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    rerender(<DesktopChatPanel {...makeProps()} />)
    rerender(<DesktopChatPanel {...makeProps()} />)

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  // T17 — Mutation throw does not block render.
  it('T17 mutation rejection does not propagate; ChatPanel still renders', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('transport down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { getByTestId } = render(<DesktopChatPanel {...makeProps()} />)

    expect(getByTestId('chat-panel')).toBeDefined()
    // Allow microtasks to settle so the .catch() runs.
    await Promise.resolve()
    await Promise.resolve()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  // T18 — Mutation success path does not block render.
  it('T18 mutation resolution does not block ChatPanel render', async () => {
    mutateAsyncMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' })

    const { getByTestId } = render(<DesktopChatPanel {...makeProps()} />)

    expect(getByTestId('chat-panel')).toBeDefined()
    await Promise.resolve()
  })

  // T19 — `activeProjectId` change does not re-fire (empty-deps useEffect).
  it('T19 activeProjectId change between renders does not re-trigger the mutation', () => {
    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_A })

    const { rerender } = render(<DesktopChatPanel {...makeProps()} />)
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_A })

    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_B })
    rerender(<DesktopChatPanel {...makeProps()} />)
    rerender(<DesktopChatPanel {...makeProps()} />)

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    // Still the original projectId; the second render did not re-fire.
    expect(mutateAsyncMock).not.toHaveBeenCalledWith({ projectId: PROJECT_B })
  })
})
