/**
 * WR-162 SP 4 — Authorization-event lookup helper backing SUP-004.
 *
 * SDS § Detector-by-detector mechanism ledger § SUP-004 and § Boundaries
 * § Interfaces item 2 `WitnessReadonlyView.hasAuthorizationForAction`.
 *
 * Scans the witness ledger (via `IWitnessService.verify()` — existing
 * surface) for an `authorization`-stage event matching
 * `{ actionCategory, actionRef }`. The verify-based scan avoids adding a
 * new method to `IWitnessService` in SP 4 (SUPV-SP4-003 Decision 7
 * follow-up); the telemetry cost is reviewed in the CR.
 *
 * The helper is pure from the caller's perspective — no mutation, no side
 * effects beyond reading through the witness service. It returns `true`
 * when a matching authorization event exists, `false` otherwise (or when
 * verify itself fails — we treat "cannot verify" as "no auth evidence"
 * because silently returning `true` would mask upstream defects per
 * `feedback_no_heuristic_bandaids.md`).
 */
import type {
  CriticalActionCategory,
  IWitnessService,
  WitnessEvent,
} from '@nous/shared';

export interface HasAuthorizationForActionParams {
  actionCategory: CriticalActionCategory;
  actionRef: string;
}

export async function hasAuthorizationForAction(
  witnessService: IWitnessService,
  params: HasAuthorizationForActionParams,
  readEventsForAuthorization?: () => Promise<readonly WitnessEvent[]>,
): Promise<boolean> {
  if (readEventsForAuthorization !== undefined) {
    try {
      const events = await readEventsForAuthorization();
      return events.some(
        (ev) =>
          ev.stage === 'authorization' &&
          ev.actionCategory === params.actionCategory &&
          ev.actionRef === params.actionRef &&
          ev.status === 'approved',
      );
    } catch {
      return false;
    }
  }
  // Fallback to verify-report inspection. The verify report itself does
  // not carry the full event list by default; SP 4's default runtime wires
  // an explicit `readEventsForAuthorization` closure against the witnessd
  // ledger. This branch returns `false` when neither source is available —
  // treating "cannot prove" as "no auth evidence" (safe-default posture).
  try {
    await witnessService.verify();
  } catch {
    // fall through
  }
  return false;
}
