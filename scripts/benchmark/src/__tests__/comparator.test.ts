import { describe, it, expect } from 'vitest';
import { compare } from '../comparator.js';
import type { RunRecord } from '@nous/shared';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const BASELINE_RUN_ID = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date().toISOString();

const baseRunRecord = (overrides: Partial<RunRecord>): RunRecord =>
  ({
    benchmark_id: 'nodeflow-smoke',
    benchmark_version: '1.0.0',
    task_id: 'task-001',
    run_id: RUN_ID,
    seed: 'seed-123',
    project_id: 'proj-001',
    target_agent_id: 'mock',
    target_agent_version: '1.0.0',
    adapter_id: 'mock-adapter',
    capability_profile: 'default',
    started_at: NOW,
    completion_status: 'success',
    time_to_success_ms: 1000,
    intervention_events: 0,
    policy_events: 0,
    finished_at: NOW,
    evidence_bundle_ref: 'evt-001',
    ...overrides,
  }) as RunRecord;

describe('compare', () => {
  it('produces ComparatorResult with withinTolerance true when run matches baseline', () => {
    const runRecord = baseRunRecord({ run_id: RUN_ID });
    const baselineRunRecord = baseRunRecord({
      run_id: BASELINE_RUN_ID,
      time_to_success_ms: 1000,
      intervention_events: 0,
    });

    const result = compare({ runRecord, baselineRunRecord });
    expect(result.runId).toBe(RUN_ID);
    expect(result.baselineRunId).toBe(BASELINE_RUN_ID);
    expect(result.withinTolerance).toBe(true);
  });

  it('produces withinTolerance false when time_to_success exceeds 1.25x baseline', () => {
    const runRecord = baseRunRecord({
      run_id: RUN_ID,
      time_to_success_ms: 2000,
    });
    const baselineRunRecord = baseRunRecord({
      run_id: BASELINE_RUN_ID,
      time_to_success_ms: 1000,
      intervention_events: 0,
    });

    const result = compare({ runRecord, baselineRunRecord });
    expect(result.timeToSuccessRatio).toBe(2);
    expect(result.withinTolerance).toBe(false);
  });
});
