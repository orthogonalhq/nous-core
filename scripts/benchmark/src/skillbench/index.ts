import type { EvidenceBundle, RunRecord, ScoreReport } from '@nous/shared';

export interface SkillBenchRunEvidence {
  runRecord: RunRecord;
  scoreReport: ScoreReport;
  evidenceBundle: EvidenceBundle;
  modelProfile: string;
}

export interface FixedModelDriftResult {
  driftDetected: boolean;
  reasonCode?: 'SCM-005-MODEL-DRIFT';
  checkedRuns: number;
}

export interface SkillAttributionEvidenceBundle {
  benchmark_pack_ref: string;
  model_profile_locked: string;
  baseline_revision_ref: string;
  candidate_revision_ref: string;
  seed_set_ref: string;
  run_record_refs: string[];
  score_report_refs: string[];
  trace_bundle_refs: string[];
  drift_detected: boolean;
  drift_reason_code?: 'SCM-005-MODEL-DRIFT';
}

export interface BuildAttributionEvidenceInput {
  benchmarkPackRef: string;
  modelProfileLocked: string;
  baselineRevisionRef: string;
  candidateRevisionRef: string;
  seedSetRef: string;
  baselineRuns: SkillBenchRunEvidence[];
  candidateRuns: SkillBenchRunEvidence[];
}

const unique = (values: string[]): string[] => Array.from(new Set(values));

export function detectFixedModelDrift(
  runs: SkillBenchRunEvidence[],
  modelProfileLocked: string,
): FixedModelDriftResult {
  const driftDetected = runs.some((run) => run.modelProfile !== modelProfileLocked);
  return {
    driftDetected,
    ...(driftDetected ? { reasonCode: 'SCM-005-MODEL-DRIFT' as const } : {}),
    checkedRuns: runs.length,
  };
}

export function buildSkillAttributionEvidenceBundle(
  input: BuildAttributionEvidenceInput,
): SkillAttributionEvidenceBundle {
  const allRuns = [...input.baselineRuns, ...input.candidateRuns];
  const drift = detectFixedModelDrift(allRuns, input.modelProfileLocked);

  return {
    benchmark_pack_ref: input.benchmarkPackRef,
    model_profile_locked: input.modelProfileLocked,
    baseline_revision_ref: input.baselineRevisionRef,
    candidate_revision_ref: input.candidateRevisionRef,
    seed_set_ref: input.seedSetRef,
    run_record_refs: unique(allRuns.map((run) => `run:${run.runRecord.run_id}`)),
    score_report_refs: unique(
      allRuns.map((run) => `score:${run.scoreReport.run_id}`),
    ),
    trace_bundle_refs: unique(
      allRuns.map((run) => `trace:${run.evidenceBundle.trace.run_id}`),
    ),
    drift_detected: drift.driftDetected,
    ...(drift.reasonCode ? { drift_reason_code: drift.reasonCode } : {}),
  };
}

