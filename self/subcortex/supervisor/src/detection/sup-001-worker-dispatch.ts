/**
 * SUP-001 — Worker agent attempted agent-dispatch. S0 / hard-stop.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes        Detection Source
 *   SUP-001   S0        hard_stop    START-003     Outbox `dispatch_agent` tool call from a Worker agent class.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-001):
 *   Contract-grounded exact-match. Candidate iff
 *     `observation.toolCall !== null`
 *     && `observation.agentClass === 'Worker'`
 *     && `observation.toolCall.name === 'dispatch_agent'`.
 *   All three are populated by `SupervisorOutboxSink.emit(...)` from the
 *   `GatewayOutboxEvent` + `GatewayRunSnapshotRegistry`. When any is null
 *   the detector returns `null` (contract-grounded no-fire, not silent
 *   weakening).
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup001Workers: DetectorFn = async (
  input: SupervisorObservation,
  _context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  if (input.toolCall === null) return null;
  if (input.agentClass !== 'Worker') return null;
  if (input.toolCall.name !== 'dispatch_agent') return null;
  return {
    supCode: 'SUP-001',
    severity: 'S0',
    reason:
      'Worker-class agent attempted tool call `dispatch_agent` (Worker agents must not dispatch sub-agents; START-003).',
    detail: {
      toolCallName: input.toolCall.name,
      agentClass: input.agentClass,
    },
  };
};

export default detectSup001Workers;
