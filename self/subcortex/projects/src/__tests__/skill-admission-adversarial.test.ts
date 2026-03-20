import { describe, expect, it } from 'vitest';
import type { SkillAdmissionEvent } from '@nous/shared';
import { SkillAdmissionOrchestrator } from '../skill-admission/orchestrator.js';
import type { SkillAdmissionEvidenceEmitter } from '../skill-admission/evidence-emitter.js';

const buildValidInputs = async (orchestrator: SkillAdmissionOrchestrator) => {
  const validation = await orchestrator.validateSkillContract({
    skill_id: 'skill:engineer-workflow-sop',
    revision_id: 'rev-002',
    artifact: {
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-002',
      skill_root_ref: '.skills/engineer-workflow-sop',
      has_skill_md: true,
      manifest_ref: '.skills/engineer-workflow-sop/SKILL.md',
      skill_package_kind: 'atomic' as const,
      resource_refs: {
        references: [],
        scripts: [],
        assets: [],
      },
    },
    authoring_workmode: 'system:skill_authoring',
    actor_id: 'worker-agent',
  });

  const benchmark = await orchestrator.evaluateSkillBench({
    skill_id: 'skill:engineer-workflow-sop',
    revision_id: 'rev-002',
    actor_id: 'worker-agent',
    evidence: {
      benchmark_pack_ref: 'bench/skillbench-core',
      model_profile_locked: 'gpt-5-high',
      baseline_revision_ref: 'rev-001',
      candidate_revision_ref: 'rev-002',
      seed_set_ref: 'seed-set-a',
      run_record_refs: ['run:1'],
      score_report_refs: ['score:1'],
      trace_bundle_refs: ['trace:1'],
      drift_detected: false,
    },
  });

  const thesis = await orchestrator.evaluateAttributionThesis({
    skill_id: 'skill:engineer-workflow-sop',
    revision_id: 'rev-002',
    actor_id: 'worker-agent',
    thesis: {
      thesis_ref: '.worklog/phase-7/phase-7.5/thesis-rev-002.mdx',
      hypothesis: 'Policy-guided prompts reduce misses.',
      method: 'A/B with fixed model and same seed set.',
      results_summary: 'Success rate improved by 14 points.',
      uplift_source: 'skill_logic',
      risk_summary: 'No safety regressions detected.',
      recommendation: 'promote',
      evidence_refs: ['run:1', 'score:1'],
    },
  });

  return { validation, benchmark, thesis };
};

describe('SkillAdmissionOrchestrator adversarial', () => {
  it('blocks worker self-promotion requests', async () => {
    const orchestrator = new SkillAdmissionOrchestrator();
    const { validation, benchmark, thesis } = await buildValidInputs(orchestrator);

    const result = await orchestrator.requestAdmission({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-002',
      requested_by: 'worker_agent',
      requested_decision: 'promote',
      validation,
      benchmark,
      thesis,
      safety_regression_open: false,
      trust_regression_open: false,
    });

    expect(result.decision).toBe('blocked');
    expect(result.reason_code).toBe('SCM-003-WORKER-SELF-PROMOTION');
  });

  it('invalidates benchmark requests with fixed-model drift', async () => {
    const orchestrator = new SkillAdmissionOrchestrator();
    const result = await orchestrator.evaluateSkillBench({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-003',
      actor_id: 'worker-agent',
      evidence: {
        benchmark_pack_ref: 'bench/skillbench-core',
        model_profile_locked: 'gpt-5-high',
        baseline_revision_ref: 'rev-002',
        candidate_revision_ref: 'rev-003',
        seed_set_ref: 'seed-set-b',
        run_record_refs: ['run:2'],
        score_report_refs: ['score:2'],
        trace_bundle_refs: ['trace:2'],
        drift_detected: true,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.reason_code).toBe('SCM-005-MODEL-DRIFT');
  });

  it('fails closed when witness linkage is missing', async () => {
    const badEmitter: SkillAdmissionEvidenceEmitter = {
      async emit(
        event,
      ): Promise<SkillAdmissionEvent> {
        return {
          event_type: event.event_type,
          skill_id: event.skill_id,
          revision_id: event.revision_id,
          ...(event.reason_code ? { reason_code: event.reason_code } : {}),
          witness_ref: '',
          evidence_refs: event.evidence_refs,
          occurred_at: new Date().toISOString(),
        };
      },
    };

    const orchestrator = new SkillAdmissionOrchestrator({
      evidenceEmitter: badEmitter,
    });

    const validation = await orchestrator.validateSkillContract({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-004',
      artifact: {
        skill_id: 'skill:engineer-workflow-sop',
        revision_id: 'rev-004',
        skill_root_ref: '.skills/engineer-workflow-sop',
        has_skill_md: true,
        manifest_ref: '.skills/engineer-workflow-sop/SKILL.md',
        skill_package_kind: 'atomic' as const,
        resource_refs: {
          references: [],
          scripts: [],
          assets: [],
        },
      },
      authoring_workmode: 'system:skill_authoring',
      actor_id: 'worker-agent',
    });

    expect(validation.passed).toBe(false);
    expect(validation.violations[0]?.code).toBe('EVID-001-MISSING-WITNESS');
  });
});

