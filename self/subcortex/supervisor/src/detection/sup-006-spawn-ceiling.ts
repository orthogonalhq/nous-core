/**
 * SUP-006 — Spawn budget ceiling breach. S1 / auto-pause.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes   Detection Source
 *   SUP-006   S1        auto_pause   —        BudgetTracker spawn-ceiling check.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-006):
 *   Contract-grounded delegation to `BudgetTracker.getSpawnBudgetExceeded()`.
 *   When `context.budget` is null, SUP-006 does not fire. Dedup (same
 *   `supCode + runId` suppression after first fire) is enforced by the
 *   classifier/service path — detectors report the breach whenever the
 *   tracker reports it.
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup006SpawnCeiling: DetectorFn = async (
  _input: SupervisorObservation,
  context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  if (context.budget === null) return null;
  if (context.budget.getSpawnBudgetExceeded() !== true) return null;
  return {
    supCode: 'SUP-006',
    severity: 'S1',
    reason: 'Agent spawn-budget ceiling breached (BudgetTracker spawnBudgetExceeded flag tripped).',
    detail: {},
  };
};

export default detectSup006SpawnCeiling;
