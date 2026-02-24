/**
 * MemoryQualityBench smoke subset — store/do-not-store/scope placement checks.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import type { BenchmarkSpec } from '@nous/shared';
import { BenchmarkSpecSchema } from '@nous/shared';

export const MEMORY_QUALITY_SMOKE_SPEC: BenchmarkSpec = BenchmarkSpecSchema.parse({
  benchmark_id: 'memory-quality-smoke',
  benchmark_version: '1.0.0',
  task_id: 'memory-quality-smoke-001',
  task_payload: { store_do_not_store: true },
  rubric: { false_memory_rate: 0 },
  family: 'memory-quality',
});
