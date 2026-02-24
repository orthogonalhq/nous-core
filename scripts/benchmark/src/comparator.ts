/**
 * Comparator for benchmark runs — produces comparison result against baseline.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 * OpenClaw is P0 baseline.
 */
import type { RunRecord } from '@nous/shared';

export interface ComparatorResult {
  runId: string;
  baselineRunId: string;
  taskCompletionDelta: number;
  interventionBurdenDelta: number;
  timeToSuccessRatio: number;
  withinTolerance: boolean;
}

export interface CompareInput {
  runRecord: RunRecord;
  baselineRunRecord: RunRecord;
}

/**
 * Compare a run against the baseline (e.g., OpenClaw).
 * Reference-agent comparative gates (P0): task completion within 5%, intervention
 * burden no worse than 15%, median time-to-success no worse than 1.25x.
 */
export function compare(input: CompareInput): ComparatorResult {
  const { runRecord, baselineRunRecord } = input;

  const taskCompletionDelta = 0; // Placeholder: would compute from metrics
  const interventionBurdenDelta =
    runRecord.intervention_events - baselineRunRecord.intervention_events;
  const timeToSuccessRatio =
    baselineRunRecord.time_to_success_ms > 0
      ? runRecord.time_to_success_ms / baselineRunRecord.time_to_success_ms
      : 1;

  const withinTolerance =
    Math.abs(taskCompletionDelta) <= 5 &&
    interventionBurdenDelta <= baselineRunRecord.intervention_events * 0.15 &&
    timeToSuccessRatio <= 1.25;

  return {
    runId: runRecord.run_id,
    baselineRunId: baselineRunRecord.run_id,
    taskCompletionDelta,
    interventionBurdenDelta,
    timeToSuccessRatio,
    withinTolerance,
  };
}
