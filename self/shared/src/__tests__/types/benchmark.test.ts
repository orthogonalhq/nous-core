import { describe, it, expect } from 'vitest';
import {
  BenchmarkSpecSchema,
  RunRecordSchema,
  EvidenceBundleSchema,
  ScoreReportSchema,
  RunEnvelopeSchema,
} from '../../types/benchmark.js';

const NOW = new Date().toISOString();
const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const HASH = 'a'.repeat(64);

describe('BenchmarkSpecSchema', () => {
  it('accepts valid spec', () => {
    const result = BenchmarkSpecSchema.safeParse({
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      task_id: 'task-001',
      task_payload: {},
      rubric: {},
      family: 'nodeflow',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid benchmark_id', () => {
    expect(
      BenchmarkSpecSchema.safeParse({
        benchmark_id: 'Invalid-ID',
        benchmark_version: '1.0.0',
        task_id: 'task-001',
        task_payload: {},
        rubric: {},
        family: 'nodeflow',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid family', () => {
    expect(
      BenchmarkSpecSchema.safeParse({
        benchmark_id: 'nodeflow-smoke',
        benchmark_version: '1.0.0',
        task_id: 'task-001',
        task_payload: {},
        rubric: {},
        family: 'unknown',
      }).success,
    ).toBe(false);
  });
});

describe('RunEnvelopeSchema', () => {
  const validEnvelope = {
    benchmark_id: 'nodeflow-smoke',
    benchmark_version: '1.0.0',
    task_id: 'task-001',
    run_id: RUN_ID,
    seed: 'seed-123',
    project_id: 'proj-001',
    target_agent_id: 'openclaw',
    target_agent_version: '1.0.0',
    adapter_id: 'openclaw-adapter',
    capability_profile: 'default',
    started_at: NOW,
  };

  it('accepts valid envelope', () => {
    expect(RunEnvelopeSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it('accepts optional workflow_ref', () => {
    expect(
      RunEnvelopeSchema.safeParse({ ...validEnvelope, workflow_ref: 'wf-1' })
        .success,
    ).toBe(true);
  });
});

describe('RunRecordSchema', () => {
  it('accepts valid run record', () => {
    const result = RunRecordSchema.safeParse({
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      task_id: 'task-001',
      run_id: RUN_ID,
      seed: 'seed-123',
      project_id: 'proj-001',
      target_agent_id: 'openclaw',
      target_agent_version: '1.0.0',
      adapter_id: 'openclaw-adapter',
      capability_profile: 'default',
      started_at: NOW,
      completion_status: 'success',
      time_to_success_ms: 1000,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
      evidence_bundle_ref: 'evt-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing evidence_bundle_ref', () => {
    const record = {
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      task_id: 'task-001',
      run_id: RUN_ID,
      seed: 'seed-123',
      project_id: 'proj-001',
      target_agent_id: 'openclaw',
      target_agent_version: '1.0.0',
      adapter_id: 'openclaw-adapter',
      capability_profile: 'default',
      started_at: NOW,
      completion_status: 'success',
      time_to_success_ms: 1000,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
      evidence_bundle_ref: '',
    };
    expect(RunRecordSchema.safeParse(record).success).toBe(false);
  });
});

describe('EvidenceBundleSchema', () => {
  it('accepts valid evidence bundle', () => {
    const result = EvidenceBundleSchema.safeParse({
      run_id: RUN_ID,
      trace: { run_id: RUN_ID, events: [] },
      side_effects: { run_id: RUN_ID, events: [] },
      artifacts: {
        run_id: RUN_ID,
        artifacts: [],
        evidence_bundle_ref: 'evt-001',
      },
      evidence_bundle_ref: 'evt-001',
    });
    expect(result.success).toBe(true);
  });
});

describe('ScoreReportSchema', () => {
  it('accepts valid score report', () => {
    const result = ScoreReportSchema.safeParse({
      run_id: RUN_ID,
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      family: 'nodeflow',
      metrics: { valid_transition_rate: 1 },
      gate_outcome: 'pass',
      hard_gate_violations: [],
    });
    expect(result.success).toBe(true);
  });

  it('defaults hard_gate_violations to empty array', () => {
    const result = ScoreReportSchema.safeParse({
      run_id: RUN_ID,
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      family: 'nodeflow',
      metrics: {},
      gate_outcome: 'fail',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hard_gate_violations).toEqual([]);
    }
  });
});
