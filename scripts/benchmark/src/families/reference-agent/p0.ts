/**
 * Reference-agent P0 task pack — comparative usability baseline.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import type { BenchmarkSpec } from '@nous/shared';
import { BenchmarkSpecSchema } from '@nous/shared';

export const REFERENCE_AGENT_P0_SPEC: BenchmarkSpec = BenchmarkSpecSchema.parse({
  benchmark_id: 'reference-agent-p0',
  benchmark_version: '1.0.0',
  task_id: 'reference-agent-p0-001',
  task_payload: { core_operator_workflow: true },
  rubric: { task_completion: 1, intervention_burden: 0 },
  family: 'reference-agent',
});
