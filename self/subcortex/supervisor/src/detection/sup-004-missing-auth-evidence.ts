/**
 * SUP-004 — Missing authorization evidence for critical action. S1 / auto-pause.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes     Detection Source
 *   SUP-004   S1        auto_pause   AUTH-001   Witness authorization event gap for critical-action categories.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-004):
 *   Contract-grounded witness gap. When the observation carries an
 *   `actionClaim` naming a non-supervisor critical-action category,
 *   scan the witness ledger via `context.witness.hasAuthorizationForAction`
 *   for a matching authorization-stage event. If absent → candidate.
 *   `supervisor-detection` / `supervisor-enforcement` action categories
 *   are EXCLUDED (the supervisor authors these categories itself;
 *   self-authorization is out of scope).
 */
import type { CriticalActionCategory, SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

const NON_SUPERVISOR_CRITICAL_ACTIONS: ReadonlySet<CriticalActionCategory> =
  new Set<CriticalActionCategory>([
    'model-invoke',
    'tool-execute',
    'memory-write',
    'trace-persist',
    'opctl-command',
    'mao-projection',
  ]);

function isCriticalActionCategory(value: string): value is CriticalActionCategory {
  return NON_SUPERVISOR_CRITICAL_ACTIONS.has(value as CriticalActionCategory);
}

export const detectSup004MissingAuthEvidence: DetectorFn = async (
  input: SupervisorObservation,
  context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  const claim = input.actionClaim;
  if (claim === null) return null;
  if (!isCriticalActionCategory(claim.actionCategory)) return null;
  const hasAuth = await context.witness.hasAuthorizationForAction({
    actionCategory: claim.actionCategory,
    actionRef: claim.actionRef,
  });
  if (hasAuth) return null;
  return {
    supCode: 'SUP-004',
    severity: 'S1',
    reason: `Critical action '${claim.actionCategory}' (ref '${claim.actionRef}') has no matching authorization witness event (AUTH-001 gap).`,
    detail: {
      actionCategory: claim.actionCategory,
      actionRef: claim.actionRef,
    },
  };
};

export default detectSup004MissingAuthEvidence;
