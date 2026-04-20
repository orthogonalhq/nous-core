/**
 * SP 1.8 Fix #14 — Shared welcome-trigger hook.
 *
 * `useFireWelcomeOnMount(activeProjectId)` centralizes the one-shot
 * welcome-emission firing concern that previously lived inline inside
 * `DesktopChatPanel`. Both `DesktopChatPanel` (dockview) and
 * `ConnectedChatSurface` (simple mode) now invoke this hook so the
 * welcome turn fires once on first-run completion regardless of which
 * shell mode the user lands in. The persisted `welcomeMessageSent` flag
 * (set inside the welcome-coordinator after STM append) remains the
 * cross-mount idempotency gate.
 *
 * Trace: SP 1.8 SDS § 4.8 / Goals C13 / C14 / C15 / C16; Plan Task #14;
 * ADR 023; Invariant A (set-after-await).
 *
 * --- BINDING IMPLEMENTATION INVARIANT (SDS § 0 Note 2 / I10 / Goals C13) ---
 *
 * `welcomeFiredRef.current = true` MUST be set AFTER the await, conditional
 * on the result. Setting it before the await reproduces the BT R2 bug
 * (Issue 3) — when `activeProjectId === null` at first render the
 * coordinator returns `{ welcomeFired: false, reason: 'no_project_id' }`
 * but the latch then prevents the next render's retry, so the welcome
 * never fires.
 *
 * The latch rule:
 *
 *   if (
 *     result.welcomeFired === true ||
 *     (result.welcomeFired === false && result.reason !== 'no_project_id')
 *   ) {
 *     welcomeFiredRef.current = true
 *   }
 *
 * `'no_project_id'` outcomes leave the ref `false` so the next render
 * with a non-null `activeProjectId` re-fires (the dockview RC-3b retry
 * path). All other `welcomeFired: false` reasons (`already_sent`,
 * `composition_error`, `empty_response`, `stm_append_error`) latch the
 * ref because the coordinator already evaluated the persisted flag and
 * either succeeded (already_sent) or hit a non-retryable failure.
 */
import { useEffect, useRef } from 'react'
import { trpc } from '@nous/transport'

export function useFireWelcomeOnMount(activeProjectId: string | null): void {
  // `welcomeFiredRef` is the BINDING latch (Invariant A): set to `true`
  // ONLY after the await, conditional on the result. `'no_project_id'`
  // outcomes leave it `false` so the next render with a non-null
  // `activeProjectId` re-fires.
  const welcomeFiredRef = useRef(false)
  // `inFlightRef` is a synchronous concurrency guard for StrictMode
  // double-invocation in development (per Goals C15 / SP 1.6 T15
  // contract). It latches synchronously to coalesce StrictMode's
  // back-to-back effect invocations, and is reset in `finally` so a
  // legitimate retry (e.g., after `'no_project_id'`) is not blocked.
  // This guard does NOT replace the BINDING `welcomeFiredRef` post-await
  // contract — it only prevents the same render's effect from racing
  // itself.
  const inFlightRef = useRef(false)
  const fireWelcome = trpc.chat.fireWelcomeIfUnsent.useMutation()

  useEffect(() => {
    if (welcomeFiredRef.current) return
    if (activeProjectId === null) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    const projectId = activeProjectId
    void (async () => {
      try {
        const result = await fireWelcome.mutateAsync({ projectId })
        // BINDING — set-after-await, conditional. See doc-comment above.
        if (
          result.welcomeFired === true ||
          (result.welcomeFired === false && result.reason !== 'no_project_id')
        ) {
          welcomeFiredRef.current = true
        }
        // else: leave `welcomeFiredRef` `false` so the next render with a
        // non-null `activeProjectId` re-fires (dockview RC-3b retry path).
      } catch {
        // Defensive only — the coordinator never throws (failure modes
        // are returned as `welcomeFired: false`). A throw at this surface
        // is a transport-layer error (network, serialization). Log via
        // console; do not propagate (must not block the host render).
        console.warn('[nous:welcome] fireWelcomeIfUnsent transport error')
      } finally {
        inFlightRef.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])
}
