/**
 * Agent adapter contract types for cross-agent benchmark evaluation.
 *
 * Phase 2.4 — Benchmark Comparator and Adapter Baseline.
 * Canonical source: agent-adapter-contract-v1.md
 */
import { z } from 'zod';
import type { TraceBundle, SideEffectBundle, ArtifactBundle } from './benchmark.js';
import {
  RunEnvelopeSchema,
  RunIdSchema,
  IsoUtcSchema,
} from './benchmark.js';

// --- AdapterMetadata ---

export const AdapterSupportsSchema = z.object({
  tools: z.boolean(),
  multimodal_image: z.boolean(),
  memory_ops: z.boolean(),
  workflow_dag: z.boolean(),
});

export const AdapterMetadataSchema = z.object({
  adapter_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  adapter_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  target_agent_name: z.string().min(1),
  target_agent_version: z.string().min(1),
  supports: AdapterSupportsSchema,
});
export type AdapterMetadata = z.infer<typeof AdapterMetadataSchema>;

// --- TargetAgentRegistration ---

export const TargetAgentRegistrationSchema = z.object({
  target_agent_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  target_agent_name: z.string().min(1),
  target_agent_version: z.string().min(1),
  adapter_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  capability_profile: z.string().min(1),
  constraints_profile: z.string().min(1),
});
export type TargetAgentRegistration = z.infer<
  typeof TargetAgentRegistrationSchema
>;

// --- PrepareInput / PrepareOutput ---

export const PrepareInputSchema = z.object({
  run: RunEnvelopeSchema,
  task_payload: z.record(z.unknown()),
  environment_profile: z.string().min(1),
});
export type PrepareInput = z.infer<typeof PrepareInputSchema>;

export const PrepareOutputSchema = z.object({
  prepared: z.literal(true),
  prepared_at: IsoUtcSchema,
});
export type PrepareOutput = z.infer<typeof PrepareOutputSchema>;

// --- ExecuteInput / ExecuteOutput ---

export const ExecuteInputSchema = z.object({
  run: RunEnvelopeSchema,
});
export type ExecuteInput = z.infer<typeof ExecuteInputSchema>;

export const AdapterCompletionStatusSchema = z.enum([
  'success',
  'partial',
  'failed',
  'blocked',
]);
export type AdapterCompletionStatus = z.infer<
  typeof AdapterCompletionStatusSchema
>;

export const ExecuteOutputSchema = z.object({
  completion_status: AdapterCompletionStatusSchema,
  time_to_success_ms: z.number().int().nonnegative(),
  intervention_events: z.number().int().nonnegative(),
  policy_events: z.number().int().nonnegative(),
  finished_at: IsoUtcSchema,
});
export type ExecuteOutput = z.infer<typeof ExecuteOutputSchema>;

// --- CaptureInput ---

export const CaptureInputSchema = z.object({
  run: RunEnvelopeSchema,
});
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

// --- CleanupInput / CleanupOutput ---

export const CleanupInputSchema = z.object({
  run: RunEnvelopeSchema,
});
export type CleanupInput = z.infer<typeof CleanupInputSchema>;

export const CleanupOutputSchema = z.object({
  cleaned: z.literal(true),
  cleaned_at: IsoUtcSchema,
});
export type CleanupOutput = z.infer<typeof CleanupOutputSchema>;

// --- AdapterError ---

export const AdapterErrorCodeSchema = z.enum([
  'adapter_timeout',
  'target_unavailable',
  'capability_mismatch',
  'invalid_response',
  'policy_blocked',
  'execution_failed',
]);
export type AdapterErrorCode = z.infer<typeof AdapterErrorCodeSchema>;

export const AdapterErrorPhaseSchema = z.enum([
  'prepare',
  'execute',
  'capture',
  'cleanup',
]);

export const AdapterErrorSchema = z.object({
  code: AdapterErrorCodeSchema,
  phase: AdapterErrorPhaseSchema,
  retriable: z.boolean(),
  message: z.string(),
  run_id: RunIdSchema,
});
export type AdapterError = z.infer<typeof AdapterErrorSchema>;

// --- AgentAdapter interface (TypeScript only; no Zod) ---

export interface AgentAdapter {
  readonly metadata: AdapterMetadata;
  prepare(input: PrepareInput): Promise<PrepareOutput>;
  execute(input: ExecuteInput): Promise<ExecuteOutput>;
  captureTrace(input: CaptureInput): Promise<TraceBundle>;
  captureSideEffects(input: CaptureInput): Promise<SideEffectBundle>;
  collectArtifacts(input: CaptureInput): Promise<ArtifactBundle>;
  cleanup(input: CleanupInput): Promise<CleanupOutput>;
}
