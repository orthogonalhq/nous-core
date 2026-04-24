/**
 * SUP-007 — Witness hash chain break. S0 / hard-stop.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes      Detection Source
 *   SUP-007   S0        hard_stop    CHAIN-001   `WitnessService.verify()` verification report integrity check.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-007):
 *   Contract-grounded verify-report inspection.
 *     `const report = await context.witness.verify();`
 *     Candidate iff `report.status === 'fail' && (
 *       !report.ledger.hashChainValid
 *       || !report.ledger.sequenceContiguous
 *       || !report.checkpoints.checkpointChainValid
 *       || !report.checkpoints.signaturesValid
 *     )`.
 *
 *   `verify()` is memoised per `DetectorContext` instance (one verify call
 *   per observation, not per detector in the classify loop) — see
 *   `detector-context.ts`.
 *
 *   Ledger-level chain break when NO runs are registered is NOT covered by
 *   SP 4 SUP-007 (Deferred to SP 6 per SDS § Invariants SUPV-SP4-003
 *   revised § Ledger-level witness-chain break with ZERO active runs and
 *   SDS § Deferred to SP 6 item 4). SP 4 fires SUP-007 only when the
 *   observation has already passed the Identity-Completeness Gate — i.e.,
 *   the failure is tied to an active, identified run.
 */
import type { SupervisorObservation, WitnessEventId } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup007WitnessChainBreak: DetectorFn = async (
  _input: SupervisorObservation,
  context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  const report = await context.witness.verify();
  if (report.status !== 'fail') return null;
  const ledgerBroken =
    report.ledger.hashChainValid === false ||
    report.ledger.sequenceContiguous === false;
  const checkpointsBroken =
    report.checkpoints.checkpointChainValid === false ||
    report.checkpoints.signaturesValid === false;
  if (!ledgerBroken && !checkpointsBroken) return null;
  const evidenceIds: WitnessEventId[] = report.invariants.findings.flatMap(
    (finding) => finding.evidenceEventIds,
  );
  return {
    supCode: 'SUP-007',
    severity: 'S0',
    reason:
      'Witness ledger integrity check failed: hash-chain / sequence / checkpoint / signature broken (CHAIN-001).',
    detail: {
      ledgerHashChainValid: report.ledger.hashChainValid,
      ledgerSequenceContiguous: report.ledger.sequenceContiguous,
      checkpointChainValid: report.checkpoints.checkpointChainValid,
      checkpointSignaturesValid: report.checkpoints.signaturesValid,
      verifyStatus: report.status,
      evidenceEventIds: evidenceIds,
    },
  };
};

export default detectSup007WitnessChainBreak;
