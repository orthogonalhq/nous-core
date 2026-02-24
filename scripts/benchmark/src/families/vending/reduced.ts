/**
 * VendingBench reduced contract — nightly mini-run.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import type { BenchmarkSpec } from '@nous/shared';
import { BenchmarkSpecSchema } from '@nous/shared';

export const VENDING_REDUCED_SPEC: BenchmarkSpec = BenchmarkSpecSchema.parse({
  benchmark_id: 'vending-reduced',
  benchmark_version: '1.0.0',
  task_id: 'vending-reduced-001',
  task_payload: { episode_count: 3 },
  rubric: { success_rate_slope: 0 },
  family: 'vending',
});
