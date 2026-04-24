/**
 * SUP-008 — Missing lifecycle transition (invalid predecessor). S1 / auto-pause.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes     Detection Source
 *   SUP-008   S1        auto_pause   FLOW-001   Outbox lifecycle event sequence gap.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-008):
 *   Contract-grounded lifecycle-sequence check. `observation.lifecycleTransition`
 *   is `{ from, to }`. The `ALLOWED_TRANSITIONS` graph (from
 *   `LifecycleTransitionPayloadSchema` at
 *   `self/shared/src/event-bus/types.ts`, narrowed to the happy path)
 *   defines legal predecessors of each terminal state. SP 4 applies the
 *   per-observation graph check (from-state reachability); per-run state
 *   machine tracking is deferred to SP 6.
 *
 *   Candidate iff `observation.lifecycleTransition !== null` AND either
 *   the `to` state is unknown to the graph OR `from` is not a valid
 *   predecessor of `to`.
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

/**
 * Canonical lifecycle predecessor map. Keys are `to` states; values are
 * the set of allowed `from` states. Derived from
 * `LifecycleTransitionPayloadSchema` (self/shared/src/event-bus/types.ts)
 * ordered progression:
 *   pending → running → completed
 *   running → failed | cancelled
 *   pending → cancelled (pre-start cancel)
 *
 * Any transition outside this graph fires SUP-008.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pending: [],
  running: ['pending'],
  completed: ['running'],
  failed: ['running'],
  cancelled: ['pending', 'running'],
});

export const detectSup008MissingLifecycle: DetectorFn = async (
  input: SupervisorObservation,
  _context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  const transition = input.lifecycleTransition;
  if (transition === null) return null;
  const allowedFromStates = ALLOWED_TRANSITIONS[transition.to];
  if (allowedFromStates === undefined) {
    return {
      supCode: 'SUP-008',
      severity: 'S1',
      reason: `Lifecycle transition to unknown terminal state '${transition.to}' (not in allowed-transition graph).`,
      detail: {
        from: transition.from,
        to: transition.to,
      },
    };
  }
  if (allowedFromStates.length > 0 && !allowedFromStates.includes(transition.from)) {
    return {
      supCode: 'SUP-008',
      severity: 'S1',
      reason: `Invalid lifecycle predecessor: from '${transition.from}' is not a valid predecessor of '${transition.to}' (FLOW-001).`,
      detail: {
        from: transition.from,
        to: transition.to,
        allowedFrom: allowedFromStates,
      },
    };
  }
  if (allowedFromStates.length === 0 && transition.from !== transition.to) {
    // `pending` has no valid `from` predecessor other than itself — any
    // non-equal `from` is a gap.
    return {
      supCode: 'SUP-008',
      severity: 'S1',
      reason: `Invalid lifecycle predecessor: '${transition.to}' is a root state but from='${transition.from}' claims a predecessor.`,
      detail: {
        from: transition.from,
        to: transition.to,
      },
    };
  }
  return null;
};

export default detectSup008MissingLifecycle;
