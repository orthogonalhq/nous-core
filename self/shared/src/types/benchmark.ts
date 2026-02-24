/**
 * Benchmark artifact schemas for Nous-OSS.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 * Canonical source: cross-agent-benchmark-architecture-v1.md
 */
import { z } from 'zod';

// --- Identifiers ---

export const BenchmarkIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
export type BenchmarkId = z.infer<typeof BenchmarkIdSchema>;

export const BenchmarkVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type BenchmarkVersion = z.infer<typeof BenchmarkVersionSchema>;

export const IsoUtcSchema = z.string().datetime();
export type IsoUtc = z.infer<typeof IsoUtcSchema>;

export const RunIdSchema = z.string().uuid();
export type RunId = z.infer<typeof RunIdSchema>;

// --- BenchmarkSpec ---

export const BenchmarkFamilySchema = z.enum([
  'nodeflow',
  'memory-quality',
  'vending',
  'reference-agent',
]);
export type BenchmarkFamily = z.infer<typeof BenchmarkFamilySchema>;

export const BenchmarkSpecSchema = z.object({
  benchmark_id: BenchmarkIdSchema,
  benchmark_version: BenchmarkVersionSchema,
  task_id: z.string().min(1),
  task_payload: z.record(z.unknown()),
  rubric: z.record(z.unknown()),
  family: BenchmarkFamilySchema,
});
export type BenchmarkSpec = z.infer<typeof BenchmarkSpecSchema>;

// --- RunEnvelope (shared with adapter) ---

export const RunEnvelopeSchema = z.object({
  benchmark_id: BenchmarkIdSchema,
  benchmark_version: BenchmarkVersionSchema,
  task_id: z.string().min(1),
  run_id: RunIdSchema,
  seed: z.string().min(1),
  project_id: z.string().min(1),
  target_agent_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  target_agent_version: z.string().min(1),
  adapter_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  capability_profile: z.string().min(1),
  workflow_ref: z.string().optional(),
  started_at: IsoUtcSchema,
});
export type RunEnvelope = z.infer<typeof RunEnvelopeSchema>;

// --- RunRecord ---

export const CompletionStatusSchema = z.enum([
  'success',
  'partial',
  'failed',
  'blocked',
]);
export type CompletionStatus = z.infer<typeof CompletionStatusSchema>;

export const RunRecordSchema = RunEnvelopeSchema.extend({
  completion_status: CompletionStatusSchema,
  time_to_success_ms: z.number().int().nonnegative(),
  intervention_events: z.number().int().nonnegative(),
  policy_events: z.number().int().nonnegative(),
  finished_at: IsoUtcSchema,
  evidence_bundle_ref: z.string().min(1),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

// --- EvidenceBundle components ---

export const TraceEventPhaseSchema = z.enum([
  'prepare',
  'execute',
  'observe',
  'cleanup',
]);

export const TraceEventSchema = z.object({
  ts: IsoUtcSchema,
  phase: TraceEventPhaseSchema,
  type: z.string(),
  message: z.string(),
  run_id: RunIdSchema,
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const TraceBundleSchema = z.object({
  run_id: RunIdSchema,
  events: z.array(TraceEventSchema),
});
export type TraceBundle = z.infer<typeof TraceBundleSchema>;

export const SideEffectCategorySchema = z.enum([
  'tool',
  'filesystem',
  'network',
  'approval',
  'memory',
]);

export const SideEffectEventSchema = z.object({
  ts: IsoUtcSchema,
  category: SideEffectCategorySchema,
  action: z.string(),
  allowed: z.boolean(),
  run_id: RunIdSchema,
});
export type SideEffectEvent = z.infer<typeof SideEffectEventSchema>;

export const SideEffectBundleSchema = z.object({
  run_id: RunIdSchema,
  events: z.array(SideEffectEventSchema),
});
export type SideEffectBundle = z.infer<typeof SideEffectBundleSchema>;

export const ArtifactKindSchema = z.enum([
  'log',
  'trace',
  'screenshot',
  'output',
  'evidence',
]);

export const ArtifactRefSchema = z.object({
  kind: ArtifactKindSchema,
  uri: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  run_id: RunIdSchema,
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const ArtifactBundleSchema = z.object({
  run_id: RunIdSchema,
  artifacts: z.array(ArtifactRefSchema),
  evidence_bundle_ref: z.string().min(1),
});
export type ArtifactBundle = z.infer<typeof ArtifactBundleSchema>;

export const EvidenceBundleSchema = z.object({
  run_id: RunIdSchema,
  trace: TraceBundleSchema,
  side_effects: SideEffectBundleSchema,
  artifacts: ArtifactBundleSchema,
  evidence_bundle_ref: z.string().min(1),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

// --- ScoreReport ---

export const GateOutcomeSchema = z.enum(['pass', 'fail', 'blocked']);
export type GateOutcome = z.infer<typeof GateOutcomeSchema>;

export const ScoreReportSchema = z.object({
  run_id: RunIdSchema,
  benchmark_id: BenchmarkIdSchema,
  benchmark_version: BenchmarkVersionSchema,
  family: BenchmarkFamilySchema,
  metrics: z.record(z.number()),
  gate_outcome: GateOutcomeSchema,
  hard_gate_violations: z.array(z.string()).default([]),
});
export type ScoreReport = z.infer<typeof ScoreReportSchema>;
