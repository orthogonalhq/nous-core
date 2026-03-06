import { describe, expect, it } from 'vitest';
import type { EvidenceBundle, RunRecord, ScoreReport } from '@nous/shared';
import {
  buildSkillAttributionEvidenceBundle,
  detectFixedModelDrift,
  type SkillBenchRunEvidence,
} from '../skillbench/index.js';

const NOW = new Date().toISOString();

const makeRunEvidence = (
  runId: string,
  modelProfile: string,
): SkillBenchRunEvidence => {
  const runRecord: RunRecord = {
    benchmark_id: 'skillbench-core',
    benchmark_version: '1.0.0',
    task_id: 'task-1',
    run_id: runId,
    seed: 'seed-a',
    project_id: 'project-1',
    target_agent_id: 'nous',
    target_agent_version: '0.0.1',
    adapter_id: 'mock-adapter',
    capability_profile: 'default',
    started_at: NOW,
    completion_status: 'success',
    time_to_success_ms: 100,
    intervention_events: 1,
    policy_events: 0,
    finished_at: NOW,
    evidence_bundle_ref: `evt-${runId}`,
  };

  const scoreReport: ScoreReport = {
    run_id: runId,
    benchmark_id: 'skillbench-core',
    benchmark_version: '1.0.0',
    family: 'vending',
    metrics: { time_to_success_ms: 100 },
    gate_outcome: 'pass',
    hard_gate_violations: [],
  };

  const evidenceBundle: EvidenceBundle = {
    run_id: runId,
    trace: { run_id: runId, events: [] },
    side_effects: { run_id: runId, events: [] },
    artifacts: {
      run_id: runId,
      artifacts: [],
      evidence_bundle_ref: `evt-${runId}`,
    },
    evidence_bundle_ref: `evt-${runId}`,
  };

  return { runRecord, scoreReport, evidenceBundle, modelProfile };
};

describe('skillbench helpers', () => {
  it('detects no drift when all runs match the locked model profile', () => {
    const runs = [makeRunEvidence('run-1', 'gpt-5-high')];
    const drift = detectFixedModelDrift(runs, 'gpt-5-high');

    expect(drift.driftDetected).toBe(false);
    expect(drift.checkedRuns).toBe(1);
  });

  it('detects drift when any run profile differs from lock', () => {
    const runs = [
      makeRunEvidence('run-1', 'gpt-5-high'),
      makeRunEvidence('run-2', 'gpt-5-medium'),
    ];
    const drift = detectFixedModelDrift(runs, 'gpt-5-high');

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasonCode).toBe('SCM-005-MODEL-DRIFT');
  });

  it('builds attribution evidence bundle with normalized refs', () => {
    const baselineRuns = [makeRunEvidence('run-a', 'gpt-5-high')];
    const candidateRuns = [makeRunEvidence('run-b', 'gpt-5-high')];

    const bundle = buildSkillAttributionEvidenceBundle({
      benchmarkPackRef: 'bench/skillbench-core',
      modelProfileLocked: 'gpt-5-high',
      baselineRevisionRef: 'rev-1',
      candidateRevisionRef: 'rev-2',
      seedSetRef: 'seed-set-1',
      baselineRuns,
      candidateRuns,
    });

    expect(bundle.run_record_refs).toEqual(['run:run-a', 'run:run-b']);
    expect(bundle.score_report_refs).toEqual(['score:run-a', 'score:run-b']);
    expect(bundle.trace_bundle_refs).toEqual(['trace:run-a', 'trace:run-b']);
    expect(bundle.drift_detected).toBe(false);
  });
});

