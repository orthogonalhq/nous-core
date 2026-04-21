/**
 * SP 1.6 (T14-T19) + SP 1.8 — DesktopChatPanel + ConnectedChatSurface
 * renderer wrapper tests, plus Tier-1 contract tests for the shared
 * `useFireWelcomeOnMount` hook (Plan Task #16; Goals C13-C16).
 *
 * The wrapper-level T14-T19 tests continue to assert end-to-end
 * mount-once + StrictMode + non-blocking failure semantics through the
 * shared hook (which the wrappers now delegate to). The hook-level
 * cases (a)-(e) below test the shared-hook behavior directly via
 * `renderHook`. Case (e) is the BINDING negative regression for the
 * BT R2 ref-set-before-await bug (Invariant A / SDS § 0 Note 2).
 */
import { render, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PROJECT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Mocks for renderer-side dependencies. The renderer wrapper imports
// `@nous/ui/panels`, `@nous/ui/components`, and `@nous/transport`.
const mutateAsyncMock = vi.hoisted(() => vi.fn())
const useShellContextMock = vi.hoisted(() => vi.fn(() => ({ activeProjectId: PROJECT_A })))
const useChatApiMock = vi.hoisted(() => vi.fn(() => ({})))
// SP 1.9 BT R3 — the welcome trigger now reads
// `trpc.config.getWelcomeMessageSent` as the persisted gate. Tests assert
// the mount-once contract assuming the persisted flag is `false` on
// initial mount; mocks return `{ data: false }` and the post-success
// invalidation is a stubbed no-op.
const welcomeSentDataMock = vi.hoisted(() => ({ value: false as boolean | undefined }))
const invalidateWelcomeSentMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const invalidateChatHistoryMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

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
    config: {
      getWelcomeMessageSent: {
        useQuery: () => ({ data: welcomeSentDataMock.value }),
      },
    },
    useUtils: () => ({
      config: {
        getWelcomeMessageSent: { invalidate: invalidateWelcomeSentMock },
      },
      chat: {
        getHistory: { invalidate: invalidateChatHistoryMock },
      },
    }),
  },
}))

import { ConnectedChatSurface, DesktopChatPanel } from '../desktop-chat-wrappers'
import { useFireWelcomeOnMount } from '../desktop-welcome-trigger'

function makeProps(): Parameters<typeof DesktopChatPanel>[0] {
  return {} as Parameters<typeof DesktopChatPanel>[0]
}

describe('DesktopChatPanel — welcome trigger (SP 1.6 contracts via shared hook)', () => {
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
  it('T14 fires the welcome mutation exactly once on first mount with the active projectId', async () => {
    render(<DesktopChatPanel {...makeProps()} />)
    await Promise.resolve()
    await Promise.resolve()

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_A })
  })

  // T15 — StrictMode-resilient: double-invoke effect does not double-fire.
  it('T15 StrictMode double-invokes the effect but the useRef guard prevents double-fire', async () => {
    render(
      <StrictMode>
        <DesktopChatPanel {...makeProps()} />
      </StrictMode>,
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  // T16 — Re-render does not re-fire.
  it('T16 re-rendering with new props does not re-fire the mutation', async () => {
    const { rerender } = render(<DesktopChatPanel {...makeProps()} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    rerender(<DesktopChatPanel {...makeProps()} />)
    rerender(<DesktopChatPanel {...makeProps()} />)
    await Promise.resolve()

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

  // T19 — `activeProjectId` change does not re-fire after a successful first fire.
  // Note: SP 1.8's shared hook now uses [activeProjectId] deps (not []),
  // but the latched ref still prevents re-fire after a successful first
  // call. This preserves the T19 contract.
  it('T19 activeProjectId change between renders does not re-trigger the mutation after a successful first fire', async () => {
    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_A })

    const { rerender } = render(<DesktopChatPanel {...makeProps()} />)
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_A })

    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_B })
    rerender(<DesktopChatPanel {...makeProps()} />)
    rerender(<DesktopChatPanel {...makeProps()} />)
    await Promise.resolve()

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).not.toHaveBeenCalledWith({ projectId: PROJECT_B })
  })
})

// SP 1.8 Plan Task #16c — symmetric mount-once test for ConnectedChatSurface.
describe('ConnectedChatSurface — SP 1.8 simple-mode welcome trigger', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' })
    useShellContextMock.mockReturnValue({ activeProjectId: PROJECT_A })
    useChatApiMock.mockReturnValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('mounting ConnectedChatSurface fires the welcome mutation exactly once with the active projectId', async () => {
    render(<ConnectedChatSurface />)
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: PROJECT_A })
  })
})

// SP 1.8 Plan Task #16b — Tier-1 contract tests for the shared
// `useFireWelcomeOnMount` hook (Goals C13/C14/C15/C16). Cases (a)-(e).
describe('useFireWelcomeOnMount — Tier-1 hook contract (SP 1.8)', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({ welcomeFired: true, traceId: 'tr-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // (a) — does NOT fire when activeProjectId === null.
  it('(a) does not fire when activeProjectId === null', async () => {
    renderHook(() => useFireWelcomeOnMount(null))
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  // (b) — fires once when activeProjectId becomes non-null after initial null render.
  it('(b) fires once when activeProjectId transitions from null to a real id', async () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFireWelcomeOnMount(id),
      { initialProps: { id: null as string | null } },
    )
    await Promise.resolve()
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    rerender({ id: 'p1' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledWith({ projectId: 'p1' })
  })

  // (c) — does NOT re-fire on activeProjectId change after a successful first fire.
  it('(c) does not re-fire on activeProjectId change after a successful first fire', async () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFireWelcomeOnMount(id),
      { initialProps: { id: 'p1' as string | null } },
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    rerender({ id: 'p2' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  // (d) — StrictMode double-invocation fires exactly once.
  it('(d) StrictMode double-invocation fires exactly once', async () => {
    renderHook(() => useFireWelcomeOnMount('p1'), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  // (e) — BINDING per Invariant A / SDS § 0 Note 2 / Goals C13:
  // a 'no_project_id' result MUST NOT latch the ref so the next render
  // with a non-null activeProjectId re-fires.
  it('(e) BINDING negative regression — "no_project_id" outcome leaves ref false; transition null→real id re-fires', async () => {
    // First fire returns 'no_project_id' (the BT R2 latent dockview race).
    mutateAsyncMock
      .mockResolvedValueOnce({ welcomeFired: false, reason: 'no_project_id' })
      .mockResolvedValueOnce({ welcomeFired: true, traceId: 'tr-1' })

    // Initially null — does not call.
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFireWelcomeOnMount(id),
      { initialProps: { id: null as string | null } },
    )
    await Promise.resolve()
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    // Transition to 'p1'. Effect calls; mock returns 'no_project_id'.
    // After the await, the ref MUST remain false because reason === 'no_project_id'.
    rerender({ id: 'p1' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    // Transition to 'p2' → effect deps change → re-runs because ref is still false.
    rerender({ id: 'p2' })
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(2)
    expect(mutateAsyncMock).toHaveBeenLastCalledWith({ projectId: 'p2' })
  })

  it('non-no_project_id failure (e.g., "already_sent") latches the ref — no re-fire on subsequent activeProjectId change', async () => {
    mutateAsyncMock.mockResolvedValueOnce({ welcomeFired: false, reason: 'already_sent' })

    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useFireWelcomeOnMount(id),
      { initialProps: { id: 'p1' as string | null } },
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    rerender({ id: 'p2' })
    await Promise.resolve()
    await Promise.resolve()
    // Still only one call — 'already_sent' latches the ref.
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })
})
