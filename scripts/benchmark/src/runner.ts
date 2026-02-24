/**
 * Benchmark runner — executes adapter lifecycle and produces RunRecord, EvidenceBundle, ScoreReport.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 */
import { randomUUID } from 'node:crypto';
import type { AgentAdapter, RunEnvelope } from '@nous/shared';
import type {
  BenchmarkSpec,
  RunRecord,
  EvidenceBundle,
  ScoreReport,
} from '@nous/shared';
import {
  RunRecordSchema,
  EvidenceBundleSchema,
  ScoreReportSchema,
} from '@nous/shared';
import { enforceHardGates, applyGatesToScoreReport } from './gates.js';

export interface RunResult {
  runRecord: RunRecord;
  evidenceBundle: EvidenceBundle;
  scoreReport: ScoreReport;
}

export interface RunnerInput {
  spec: BenchmarkSpec;
  adapter: AgentAdapter;
  seed: string;
  projectId: string;
  targetAgentId: string;
  targetAgentVersion: string;
}

/**
 * Execute a single benchmark run through the adapter lifecycle.
 */
export async function run(
  input: RunnerInput,
): Promise<RunResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const envelope: RunEnvelope = {
    benchmark_id: input.spec.benchmark_id,
    benchmark_version: input.spec.benchmark_version,
    task_id: input.spec.task_id,
    run_id: runId,
    seed: input.seed,
    project_id: input.projectId,
    target_agent_id: input.targetAgentId,
    target_agent_version: input.targetAgentVersion,
    adapter_id: input.adapter.metadata.adapter_id,
    capability_profile: 'default',
    started_at: startedAt,
  };

  try {
    await input.adapter.prepare({
      run: envelope,
      task_payload: input.spec.task_payload,
      environment_profile: 'default',
    });

    const execOutput = await input.adapter.execute({ run: envelope });

    const captureInput = { run: envelope };
    const [trace, sideEffects, artifacts] = await Promise.all([
      input.adapter.captureTrace(captureInput),
      input.adapter.captureSideEffects(captureInput),
      input.adapter.collectArtifacts(captureInput),
    ]);

    const runRecord: RunRecord = {
      ...envelope,
      completion_status: execOutput.completion_status,
      time_to_success_ms: execOutput.time_to_success_ms,
      intervention_events: execOutput.intervention_events,
      policy_events: execOutput.policy_events,
      finished_at: execOutput.finished_at,
      evidence_bundle_ref: artifacts.evidence_bundle_ref,
    };

    const evidenceBundle: EvidenceBundle = {
      run_id: runId,
      trace,
      side_effects: sideEffects,
      artifacts,
      evidence_bundle_ref: artifacts.evidence_bundle_ref,
    };

    const scoreReportBase: ScoreReport = {
      run_id: runId,
      benchmark_id: input.spec.benchmark_id,
      benchmark_version: input.spec.benchmark_version,
      family: input.spec.family,
      metrics: {
        time_to_success_ms: execOutput.time_to_success_ms,
        intervention_events: execOutput.intervention_events,
        policy_events: execOutput.policy_events,
      },
      gate_outcome: 'pass',
      hard_gate_violations: [],
    };

    const { violations, gateOutcome } = enforceHardGates(runRecord, evidenceBundle);
    const scoreReport = applyGatesToScoreReport(scoreReportBase, violations, gateOutcome);

    RunRecordSchema.parse(runRecord);
    EvidenceBundleSchema.parse(evidenceBundle);
    ScoreReportSchema.parse(scoreReport);

    return { runRecord, evidenceBundle, scoreReport };
  } finally {
    await input.adapter.cleanup({ run: envelope });
  }
}
