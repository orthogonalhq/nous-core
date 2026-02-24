/**
 * NodeFlowBench smoke subset — Tier 0 deterministic checks.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import type { BenchmarkSpec } from '@nous/shared';
import { BenchmarkSpecSchema } from '@nous/shared';

export const NODEFLOW_SMOKE_SPEC: BenchmarkSpec = BenchmarkSpecSchema.parse({
  benchmark_id: 'nodeflow-smoke',
  benchmark_version: '1.0.0',
  task_id: 'nodeflow-smoke-001',
  task_payload: { deterministic: true },
  rubric: { valid_transition_rate: 1 },
  family: 'nodeflow',
});
