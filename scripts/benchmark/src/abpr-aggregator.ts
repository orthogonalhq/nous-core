/**
 * ABPR (Agent Benchmark Pass Rate) aggregator.
 * Phase 2.6 — GTM gate report integration.
 * ABPR = passed_agent_benchmark_tests / total_agent_benchmark_tests
 */
import type { RunRecord } from '@nous/shared';
import { CompletionStatusSchema } from '@nous/shared';

export interface AbprResult {
  passed: number;
  total: number;
  abpr: number;
  canonical_suite_ref: string;
}

/**
 * Aggregate ABPR from a set of run records.
 * Pass = completion_status === 'success'.
 */
export function aggregateAbpr(
  runRecords: RunRecord[],
  canonicalSuiteRef: string,
): AbprResult {
  const total = runRecords.length;
  const passed = runRecords.filter((r) => {
    const status = CompletionStatusSchema.safeParse(r.completion_status);
    return status.success && status.data === 'success';
  }).length;

  return {
    passed,
    total,
    abpr: total > 0 ? passed / total : 0,
    canonical_suite_ref: canonicalSuiteRef,
  };
}
