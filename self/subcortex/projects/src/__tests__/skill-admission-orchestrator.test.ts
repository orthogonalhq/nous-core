import { describe, expect, it } from 'vitest';
import { SkillAdmissionOrchestrator } from '../skill-admission/orchestrator.js';

const NOW = new Date('2026-03-05T00:00:00.000Z').toISOString();

const createValidationInput = () => ({
  skill_id: 'skill:engineer-workflow-sop',
  revision_id: 'rev-001',
  artifact: {
    skill_id: 'skill:engineer-workflow-sop',
    revision_id: 'rev-001',
    skill_root_ref: '.skills/engineer-workflow-sop',
    has_skill_md: true,
    has_flow_yaml: false,
    step_refs: [],
  },
  authoring_workmode: 'system:skill_authoring' as const,
  actor_id: 'worker-agent',
});

const createBenchInput = () => ({
  skill_id: 'skill:engineer-workflow-sop',
  revision_id: 'rev-001',
  actor_id: 'worker-agent',
  evidence: {
    benchmark_pack_ref: 'bench/skillbench-core',
    model_profile_locked: 'gpt-5-high',
    baseline_revision_ref: 'rev-000',
    candidate_revision_ref: 'rev-001',
    seed_set_ref: 'seed-set-a',
    run_record_refs: ['run:a'],
    score_report_refs: ['score:a'],
    trace_bundle_refs: ['trace:a'],
    drift_detected: false,
  },
});

const createThesisInput = () => ({
  skill_id: 'skill:engineer-workflow-sop',
  revision_id: 'rev-001',
  actor_id: 'worker-agent',
  thesis: {
    thesis_ref: '.worklog/phase-7/phase-7.5/thesis.mdx',
    hypothesis: 'Stronger scope checks reduce policy drift.',
    method: 'Fixed-model A/B over identical seed set.',
    results_summary: 'Interventions reduced by 12%.',
    uplift_source: 'skill_logic' as const,
    risk_summary: 'No new S0/S1 findings.',
    recommendation: 'promote' as const,
    evidence_refs: ['run:a', 'score:a'],
  },
});

describe('SkillAdmissionOrchestrator', () => {
  it('returns pending_cortex when validation, benchmark, and thesis checks pass', async () => {
    const orchestrator = new SkillAdmissionOrchestrator({
      now: () => new Date(NOW),
    });

    const validation = await orchestrator.validateSkillContract(
      createValidationInput(),
    );
    expect(validation.passed).toBe(true);

    const benchmark = await orchestrator.evaluateSkillBench(createBenchInput());
    expect(benchmark.passed).toBe(true);

    const thesis = await orchestrator.evaluateAttributionThesis(createThesisInput());
    expect(thesis.passed).toBe(true);

    const admission = await orchestrator.requestAdmission({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-001',
      requested_by: 'orchestration_agent',
      requested_decision: 'promote',
      validation,
      benchmark,
      thesis,
      safety_regression_open: false,
      trust_regression_open: false,
    });

    expect(admission.decision).toBe('pending_cortex');
    expect(admission.decided_by).toBe('orchestration_agent');
  });

  it('records cortex promotion decision only from pending_cortex state', async () => {
    const orchestrator = new SkillAdmissionOrchestrator({
      now: () => new Date(NOW),
    });

    const validation = await orchestrator.validateSkillContract(
      createValidationInput(),
    );
    const benchmark = await orchestrator.evaluateSkillBench(createBenchInput());
    const thesis = await orchestrator.evaluateAttributionThesis(createThesisInput());

    await orchestrator.requestAdmission({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-001',
      requested_by: 'orchestration_agent',
      requested_decision: 'promote',
      validation,
      benchmark,
      thesis,
      safety_regression_open: false,
      trust_regression_open: false,
    });

    const promoted = await orchestrator.recordCortexDecision({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-001',
      decision: 'promoted',
      decided_by: 'nous_cortex',
      evidence_refs: ['decision:promoted'],
    });

    expect(promoted.decision).toBe('promoted');
    expect(promoted.decided_by).toBe('nous_cortex');
  });
});

