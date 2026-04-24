/**
 * SUP-005 — Agent exceeded turn/token/time budget. S1 / auto-pause.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes   Detection Source
 *   SUP-005   S1        auto_pause   —        BudgetTracker `getExhaustedReason()` via outbox events.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-005):
 *   Contract-grounded delegation to `BudgetTracker.getExhaustedReason()`.
 *   When `context.budget` is null (no tracker registered for this run) or
 *   the tracker reports `null` (not yet exhausted), SUP-005 does not
 *   fire. Otherwise, candidate carries the exhaustion reason.
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup005BudgetExhausted: DetectorFn = async (
  _input: SupervisorObservation,
  context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  if (context.budget === null) return null;
  const reason = context.budget.getExhaustedReason();
  if (reason === null) return null;
  return {
    supCode: 'SUP-005',
    severity: 'S1',
    reason: `Agent budget exhausted: ${reason}.`,
    detail: {
      exhaustedReason: reason,
    },
  };
};

export default detectSup005BudgetExhausted;
