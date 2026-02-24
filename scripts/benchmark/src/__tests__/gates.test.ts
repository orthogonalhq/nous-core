import { describe, it, expect } from 'vitest';
import { enforceHardGates, applyGatesToScoreReport } from '../gates.js';
import type { RunRecord, EvidenceBundle, ScoreReport } from '@nous/shared';

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('enforceHardGates', () => {
  it('passes when evidence_bundle_ref is present and no unauthorized side effects', () => {
    const runRecord: RunRecord = {
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
      time_to_success_ms: 100,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
      evidence_bundle_ref: 'evt-001',
    };

    const evidenceBundle: EvidenceBundle = {
      run_id: RUN_ID,
      trace: { run_id: RUN_ID, events: [] },
      side_effects: { run_id: RUN_ID, events: [] },
      artifacts: {
        run_id: RUN_ID,
        artifacts: [],
        evidence_bundle_ref: 'evt-001',
      },
      evidence_bundle_ref: 'evt-001',
    };

    const { violations, gateOutcome } = enforceHardGates(runRecord, evidenceBundle);
    expect(violations).toEqual([]);
    expect(gateOutcome).toBe('pass');
  });

  it('fails when evidence_bundle_ref is missing', () => {
    const runRecord: RunRecord = {
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
      time_to_success_ms: 100,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
      evidence_bundle_ref: '',
    };

    const evidenceBundle: EvidenceBundle = {
      run_id: RUN_ID,
      trace: { run_id: RUN_ID, events: [] },
      side_effects: { run_id: RUN_ID, events: [] },
      artifacts: {
        run_id: RUN_ID,
        artifacts: [],
        evidence_bundle_ref: '',
      },
      evidence_bundle_ref: '',
    };

    const { violations, gateOutcome } = enforceHardGates(runRecord, evidenceBundle);
    expect(violations).toContain('missing_evidence_linkage');
    expect(gateOutcome).toBe('fail');
  });

  it('fails when unauthorized side effects present', () => {
    const runRecord: RunRecord = {
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
      time_to_success_ms: 100,
      intervention_events: 0,
      policy_events: 0,
      finished_at: NOW,
      evidence_bundle_ref: 'evt-001',
    };

    const evidenceBundle: EvidenceBundle = {
      run_id: RUN_ID,
      trace: { run_id: RUN_ID, events: [] },
      side_effects: {
        run_id: RUN_ID,
        events: [
          {
            ts: NOW,
            category: 'filesystem',
            action: 'write',
            allowed: false,
            run_id: RUN_ID,
          },
        ],
      },
      artifacts: {
        run_id: RUN_ID,
        artifacts: [],
        evidence_bundle_ref: 'evt-001',
      },
      evidence_bundle_ref: 'evt-001',
    };

    const { violations, gateOutcome } = enforceHardGates(runRecord, evidenceBundle);
    expect(violations).toContain('unauthorized_critical_side_effects');
    expect(gateOutcome).toBe('fail');
  });
});

describe('applyGatesToScoreReport', () => {
  it('sets gate_outcome and hard_gate_violations', () => {
    const scoreReport: ScoreReport = {
      run_id: RUN_ID,
      benchmark_id: 'nodeflow-smoke',
      benchmark_version: '1.0.0',
      family: 'nodeflow',
      metrics: {},
      gate_outcome: 'pass',
      hard_gate_violations: [],
    };

    const updated = applyGatesToScoreReport(
      scoreReport,
      ['missing_evidence_linkage'],
      'fail',
    );
    expect(updated.gate_outcome).toBe('fail');
    expect(updated.hard_gate_violations).toEqual(['missing_evidence_linkage']);
  });
});
