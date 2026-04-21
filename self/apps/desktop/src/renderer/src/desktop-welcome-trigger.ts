/**
 * SP 1.8 Fix #14 / SP 1.9 BT R3 fix — Shared welcome-trigger hook.
 *
 * `useFireWelcomeOnMount(activeProjectId)` centralizes the one-shot
 * welcome-emission firing concern. Both `DesktopChatPanel` (dockview) and
 * `ConnectedChatSurface` (simple mode) invoke this hook so the welcome
 * turn fires once on first-run completion regardless of which shell mode
 * the user lands in.
 *
 * Two gates:
 *
 *   1. Persisted gate (cross-mount): the `config.getWelcomeMessageSent`
 *      tRPC query is the source of truth. When the wizard reset clears
 *      the agent block, this query re-fetches `false` and the gate
 *      re-opens — fixing the BT R3 wizard-reset bug where the prior
 *      ref-only latch survived wizard runs and silently blocked re-fire.
 *
 *   2. In-memory `latchRef` (per-mount): set after a successful fire OR
 *      on any non-retryable failure (composition_error, empty_response,
 *      stm_append_error, already_sent). Resets whenever the persisted
 *      flag transitions back to `false`, so a real wizard reset is not
 *      blocked. The latch closes the per-mount fire window during the
 *      brief interval between mutation success and query refetch.
 *
 * The `'no_project_id'` outcome is the BT R2 dockview-race retry path
 * (Invariant A / SDS § 0 Note 2): it leaves the latch `false` so the
 * next render with a non-null `activeProjectId` re-fires.
 *
 * After a successful fire we invalidate `chat.getHistory` so the chat
 * surface re-fetches and renders the new welcome turn. Without this,
 * the assistant entry is appended to STM but the renderer's React
 * Query cache does not know — the user sees nothing until they send
 * their own message (which incidentally invalidates history).
 *
 * `inFlightRef` is the StrictMode synchronous concurrency guard.
 */
import { useEffect, useRef } from 'react'
import { trpc } from '@nous/transport'

export function useFireWelcomeOnMount(activeProjectId: string | null): void {
  const welcomeSentQuery = trpc.config.getWelcomeMessageSent.useQuery()
  const latchRef = useRef(false)
  const inFlightRef = useRef(false)
  const fireWelcome = trpc.chat.fireWelcomeIfUnsent.useMutation()
  const utils = trpc.useUtils()

  useEffect(() => {
    if (welcomeSentQuery.data === false) {
      latchRef.current = false
    }
  }, [welcomeSentQuery.data])

  useEffect(() => {
    if (welcomeSentQuery.data !== false) return
    if (latchRef.current) return
    if (activeProjectId === null) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    const projectId = activeProjectId
    void (async () => {
      try {
        const result = await fireWelcome.mutateAsync({ projectId })
        if (
          result.welcomeFired === true ||
          (result.welcomeFired === false && result.reason !== 'no_project_id')
        ) {
          latchRef.current = true
        }
        if (result.welcomeFired === true) {
          await Promise.all([
            utils.config.getWelcomeMessageSent.invalidate(),
            utils.chat.getHistory.invalidate({ projectId }),
          ])
        }
      } catch {
        // Defensive — coordinator returns failures as `welcomeFired: false`.
        // A throw here is a transport-layer error (network, serialization).
        console.warn('[nous:welcome] fireWelcomeIfUnsent transport error')
      } finally {
        inFlightRef.current = false
      }
    })()
  }, [activeProjectId, welcomeSentQuery.data])
}
