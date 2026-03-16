import { describe, expect, it } from 'vitest';
import {
  SkillAdmissionReasonCodeSchema,
  SkillAdmissionResultSchema,
  SkillBenchEvidenceSchema,
  SkillContractValidationResultSchema,
  SkillRuntimeArtifactSchema,
} from '../../types/skill-admission.js';

const NOW = new Date().toISOString();

describe('SkillAdmissionReasonCodeSchema', () => {
  it('accepts valid SCM and SKADM reason codes', () => {
    expect(
      SkillAdmissionReasonCodeSchema.safeParse(
        'SCM-004-CONTRACT-VALIDATION-REQUIRED',
      ).success,
    ).toBe(true);
    expect(
      SkillAdmissionReasonCodeSchema.safeParse('SKADM-001-DECISION-NOT-PENDING')
        .success,
    ).toBe(true);
  });

  it('rejects invalid reason codes', () => {
    expect(SkillAdmissionReasonCodeSchema.safeParse('invalid').success).toBe(
      false,
    );
  });
});

describe('SkillRuntimeArtifactSchema', () => {
  it('accepts valid runtime artifact metadata', () => {
    const parsed = SkillRuntimeArtifactSchema.parse({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-001',
      skill_root_ref: '.skills/engineer-workflow-sop',
      has_skill_md: true,
      manifest_ref: '.skills/engineer-workflow-sop/SKILL.md',
      skill_package_kind: 'atomic',
    });
    expect(parsed.skill_id).toBe('skill:engineer-workflow-sop');
  });

  it('accepts explicit legacy hybrid compatibility refs', () => {
    const parsed = SkillRuntimeArtifactSchema.parse({
      skill_id: 'skill:a-soul-is-born',
      revision_id: 'rev-legacy',
      skill_root_ref: '.skills/.system/a-soul-is-born',
      has_skill_md: true,
      skill_package_kind: 'legacy_hybrid',
      legacy_workflow_refs: {
        flowRef: '.skills/.system/a-soul-is-born/nous.flow.yaml',
        stepRefs: ['steps/start.md'],
      },
    });

    expect(parsed.legacy_workflow_refs?.stepRefs).toHaveLength(1);
  });
});

describe('SkillBenchEvidenceSchema', () => {
  it('requires benchmark evidence refs', () => {
    const parsed = SkillBenchEvidenceSchema.safeParse({
      benchmark_pack_ref: 'bench/skillbench-core',
      model_profile_locked: 'gpt-5-high',
      baseline_revision_ref: 'rev-001',
      candidate_revision_ref: 'rev-002',
      seed_set_ref: 'seed-set-a',
      run_record_refs: [],
      score_report_refs: ['score:1'],
      trace_bundle_refs: ['trace:1'],
      drift_detected: false,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('SkillAdmissionResultSchema', () => {
  it('requires reason code for blocked decisions', () => {
    const parsed = SkillAdmissionResultSchema.safeParse({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-002',
      decision: 'blocked',
      evidence_refs: ['event:skill_admission_blocked'],
      witness_ref: 'evt-001',
      decided_by: 'orchestration_agent',
      decided_at: NOW,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts pending_cortex decisions without reason code', () => {
    const parsed = SkillAdmissionResultSchema.parse({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-002',
      decision: 'pending_cortex',
      evidence_refs: ['event:skill_admission_requested'],
      witness_ref: 'evt-002',
      decided_by: 'orchestration_agent',
      decided_at: NOW,
    });
    expect(parsed.decision).toBe('pending_cortex');
  });
});

describe('SkillContractValidationResultSchema', () => {
  it('accepts failed validation with violations', () => {
    const parsed = SkillContractValidationResultSchema.parse({
      skill_id: 'skill:engineer-workflow-sop',
      revision_id: 'rev-002',
      passed: false,
      violations: [
        {
          code: 'SCM-007-RUNTIME-CONTRACT-MISSING',
          detail: 'SKILL.md missing',
          evidence_refs: ['artifact:SKILL.md'],
        },
      ],
      witness_ref: 'evt-003',
      evidence_refs: ['event:skill_contract_validation_failed'],
    });
    expect(parsed.violations).toHaveLength(1);
  });
});

