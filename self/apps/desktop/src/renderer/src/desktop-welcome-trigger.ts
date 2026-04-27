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
 * --- BINDING IMPLEMENTATION INVARIANT (SDS § 0 Note 2 / I10 / Goals C13;
 * SP 1.9 SDS § 4.6 tightening — Invariant A) ---
 *
 * `welcomeFiredRef.current = true` MUST be set AFTER ALL awaits in the
 * emission-success branch — including the SP 1.9 Fix #6
 * `utils.chat.getHistory.invalidate({ projectId })` await — conditional on
 * the result. Setting it before the await reproduces the BT R2 bug
 * (Issue 3) — when `activeProjectId === null` at first render the
 * coordinator returns `{ welcomeFired: false, reason: 'no_project_id' }`
 * but the latch then prevents the next render's retry, so the welcome
 * never fires. Setting it before the invalidate await reopens BT R2
 * Issue 3 on stale-projectId re-renders.
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
  // SP 1.9 Fix #6 — `utils.chat.getHistory.invalidate({ projectId })` is
  // called on the `welcomeFired: true` branch BEFORE the existing latch
  // block (Invariant A tightened to "set-after-ALL-awaits in success
  // branch"). The invalidate drives a re-fetch of the `useQuery` consumer
  // in `ChatPanel` (SP 1.9 Fix #7) so the welcome assistant turn surfaces
  // in the UI immediately rather than waiting for the next user message.
  // Per Item 1 ratified decision (Plan Q-SDS-1).
  const utils = trpc.useUtils()

  useEffect(() => {
    if (welcomeFiredRef.current) return
    if (activeProjectId === null) return
    if (inFlightRef.current) return

    inFlightRef.current = true
    const projectId = activeProjectId
    void (async () => {
      try {
        const result = await fireWelcome.mutateAsync({ projectId })

        // SP 1.9 Fix #6 — invalidate `chat.getHistory` on successful welcome
        // emission. ChatPanel is a `useQuery` subscriber (SP 1.9 Fix #7)
        // so invalidation drives a re-fetch + re-render. Wrapped in
        // try/catch so a transport-layer invalidate failure does not
        // short-circuit the latch (the welcome did emit; re-fire would
        // duplicate in STM). Branch restriction: invalidate fires ONLY on
        // `welcomeFired === true` — the four `welcomeFired: false` reasons
        // (`already_sent`, `composition_error`, `empty_response`,
        // `stm_append_error`) and `'no_project_id'` do NOT invalidate
        // (Goals C13).
        if (result.welcomeFired === true) {
          try {
            await utils.chat.getHistory.invalidate({ projectId })
            console.info(
              `[nous:welcome] chat.getHistory invalidated after welcomeFired=true projectId=${projectId}`,
            )
          } catch (invalidateErr) {
            const msg = invalidateErr instanceof Error ? invalidateErr.message : String(invalidateErr)
            console.warn(`[nous:welcome] invalidate failed: ${msg}`)
          }
        }

        // BINDING — set-after-ALL-awaits-in-success-branch, conditional.
        // See doc-comment above. Latch runs after the new invalidate await
        // (Invariant A tightening).
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
