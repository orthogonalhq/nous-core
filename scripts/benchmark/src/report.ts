/**
 * Tier 2 release report contract.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import type { ScoreReport } from '@nous/shared';

export interface ReleaseReport {
  timestamp: string;
  reports: ScoreReport[];
  hardGateFailures: string[];
  promotable: boolean;
}

export function createReleaseReport(reports: ScoreReport[]): ReleaseReport {
  const hardGateFailures = reports.flatMap((r) =>
    r.gate_outcome === 'fail' ? r.hard_gate_violations : [],
  );
  const promotable = hardGateFailures.length === 0;

  return {
    timestamp: new Date().toISOString(),
    reports,
    hardGateFailures,
    promotable,
  };
}
