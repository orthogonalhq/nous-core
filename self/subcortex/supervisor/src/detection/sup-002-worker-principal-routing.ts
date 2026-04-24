/**
 * SUP-002 — Worker attempted direct Principal routing. S0 / hard-stop.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes             Detection Source
 *   SUP-002   S0        hard_stop    ISO-001, ESC-001   Outbox routing target analysis (Worker→Principal edge).
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-002):
 *   Contract-grounded exact-match. Candidate iff
 *     `observation.routingTarget !== null`
 *     && `observation.agentClass === 'Worker'`
 *     && `observation.routingTarget.kind ∈ { 'Principal', 'Cortex::Principal' }`.
 *   When the outbox does not emit a discriminated routing-target event
 *   today, `routingTarget` remains `null` — SUP-002 fires zero times
 *   (contract-grounded no-fire, per `feedback_no_heuristic_bandaids.md`;
 *   we do NOT invent a heuristic routing-target classifier).
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup002WorkerPrincipalRouting: DetectorFn = async (
  input: SupervisorObservation,
  _context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  if (input.routingTarget === null) return null;
  if (input.agentClass !== 'Worker') return null;
  if (
    input.routingTarget.kind !== 'Principal' &&
    input.routingTarget.kind !== 'Cortex::Principal'
  ) {
    return null;
  }
  return {
    supCode: 'SUP-002',
    severity: 'S0',
    reason:
      'Worker-class agent attempted to route a message directly to the Principal layer (Worker→Principal is forbidden; must escalate through Orchestrator per ISO-001/ESC-001).',
    detail: {
      routingTargetKind: input.routingTarget.kind,
      agentClass: input.agentClass,
    },
  };
};

export default detectSup002WorkerPrincipalRouting;
