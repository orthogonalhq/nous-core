/**
 * Supervisor domain types for Nous-OSS (WR-162 SP 1).
 *
 * Canonical sources:
 * - supervisor-violation-taxonomy-v1.md — severity ladder, SUP codes.
 * - supervisor-evidence-contract-v1.md — EventBus channel payloads.
 * - supervisor-observation-contract-v1.md — raw observation envelope.
 * - supervisor-topology-architecture-v1.md — ISupervisorService shapes.
 * - supervisor-trpc-procedure-set-v1.md — camelCase record shapes.
 *
 * Types-only sub-phase (WR-162 SP 1): no runtime logic.
 */
import { z } from 'zod';
import { AgentClassSchema, GatewayToolCallSchema } from './agent-gateway.js';

// --- Severity ladder (S0..S3) ---

export const SupervisorSeveritySchema = z.enum(['S0', 'S1', 'S2', 'S3']);
export type SupervisorSeverity = z.infer<typeof SupervisorSeveritySchema>;

// --- Invariant reason code (SUP-NNN) ---

export const SupCodeSchema = z.string().regex(/^SUP-\d{3}$/);
export type SupCode = z.infer<typeof SupCodeSchema>;

// --- Enforcement actions per severity mapping ---

export const SupervisorEnforcementActionSchema = z.enum([
  'hard_stop',
  'auto_pause',
  'require_review',
  'warn',
]);
export type SupervisorEnforcementAction = z.infer<
  typeof SupervisorEnforcementActionSchema
>;

// --- Guardrail status (per-agent rollup) ---

export const GuardrailStatusSchema = z.enum([
  'clear',
  'warning',
  'violation',
  'enforced',
]);
export type GuardrailStatus = z.infer<typeof GuardrailStatusSchema>;

// --- Witness chain integrity per agent ---

export const WitnessIntegrityStatusSchema = z.enum([
  'intact',
  'degraded',
  'broken',
]);
export type WitnessIntegrityStatus = z.infer<
  typeof WitnessIntegrityStatusSchema
>;

// --- Violation record (store / tRPC output) ---
// Shape derived from supervisor-evidence-contract-v1.md channel payloads
// combined with supervisor-trpc-procedure-set-v1.md § Shared domain types.

export const SupervisorViolationRecordSchema = z.object({
  supCode: SupCodeSchema,
  severity: SupervisorSeveritySchema,
  agentId: z.string(),
  agentClass: z.string(),
  runId: z.string(),
  projectId: z.string().uuid(),
  evidenceRefs: z.array(z.string()),
  detectedAt: z.string().datetime(),
  enforcement: z
    .object({
      action: z.enum(['hard_stop', 'auto_pause']),
      commandId: z.string(),
      enforcedAt: z.string().datetime(),
    })
    .nullable(),
});
export type SupervisorViolationRecord = z.infer<
  typeof SupervisorViolationRecordSchema
>;

// --- Sentinel risk score (per-project) ---
// Per supervisor-trpc-procedure-set-v1.md § Shared domain types.

export const SentinelRiskScoreSchema = z.object({
  projectId: z.string().uuid(),
  compositeRiskScore: z.number().min(0).max(1),
  activeAnomalies: z.array(
    z.object({
      supCode: SupCodeSchema,
      riskScore: z.number().min(0).max(1),
      explanation: z.string(),
      agentId: z.string(),
      classifiedAt: z.string().datetime(),
    }),
  ),
  reportedAt: z.string().datetime(),
});
export type SentinelRiskScore = z.infer<typeof SentinelRiskScoreSchema>;

// --- Aggregate status snapshot (status-bar rollup) ---
// Per supervisor-trpc-procedure-set-v1.md § Shared domain types.

export const SupervisorStatusSnapshotSchema = z.object({
  active: z.boolean(),
  agentsMonitored: z.number().int().nonnegative(),
  activeViolationCounts: z.object({
    s0: z.number().int().nonnegative(),
    s1: z.number().int().nonnegative(),
    s2: z.number().int().nonnegative(),
    s3: z.number().int().nonnegative(),
  }),
  lifetime: z.object({
    violationsDetected: z.number().int().nonnegative(),
    anomaliesClassified: z.number().int().nonnegative(),
    enforcementsApplied: z.number().int().nonnegative(),
  }),
  witnessIntegrity: WitnessIntegrityStatusSchema,
  riskSummary: z.record(z.string(), z.number().min(0).max(1)),
  reportedAt: z.string().datetime(),
});
export type SupervisorStatusSnapshot = z.infer<
  typeof SupervisorStatusSnapshotSchema
>;

// --- Raw observation envelope (input to classifier) ---
// Per supervisor-observation-contract-v1.md. The `source` tag identifies
// where the observation came from (outbox sink vs. event-bus channel vs.
// witness verification vs. periodic health probe); the payload is opaque
// at this layer — the classifier narrows per-source discriminants in SP 3.

// --- Supervisor observation routing-target and lifecycle-transition ---
// Per WR-162 SP 4 SDS § Data Model § Observation envelope extension.
// Routing-target vocabulary drawn from `AgentClassSchema` + Principal-tier
// `supervisor-scope-boundary-v1.md § Agent Class Ladder`. Lifecycle shape is
// narrowed to {from,to} per `LifecycleTransitionPayloadSchema` (SP 4 uses
// the from-state-reachability check; per-run state-machine tracking is SP 6).

export const SupervisorRoutingTargetKindSchema = z.enum([
  'Principal',
  'Orchestrator',
  'Worker',
  'System',
  'Cortex::Principal',
  'Cortex::System',
]);
export type SupervisorRoutingTargetKind = z.infer<
  typeof SupervisorRoutingTargetKindSchema
>;

export const SupervisorRoutingTargetSchema = z
  .object({
    kind: SupervisorRoutingTargetKindSchema,
  })
  .strict();
export type SupervisorRoutingTarget = z.infer<typeof SupervisorRoutingTargetSchema>;

export const SupervisorLifecycleTransitionSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();
export type SupervisorLifecycleTransition = z.infer<
  typeof SupervisorLifecycleTransitionSchema
>;

// --- Raw observation envelope (input to classifier) ---
// Per supervisor-observation-contract-v1.md (SP 1 base envelope) + SP 4
// additive enrichment fields (SUPV-SP4-003 revised). Enrichment defaults
// are `null` to preserve backward compat with SP 3 sink writes. Populated by
// `SupervisorOutboxSink.emit(...)` from the `GatewayOutboxEvent` + the
// injected `GatewayRunSnapshotRegistry` read view. Detectors treat any
// `null` enrichment field as contract-grounded no-fire (no inference).
//
// The `source` tag identifies where the observation came from (outbox sink
// vs. event-bus channel vs. witness verification vs. periodic health
// probe); the payload is opaque at this layer — the classifier narrows
// per-source discriminants in SP 3.

export const SupervisorObservationSchema = z.object({
  observedAt: z.string().datetime(),
  source: z.enum([
    'gateway_outbox',
    'event_bus',
    'witness_service',
    'health_sink',
  ]),
  payload: z.unknown(),
  // SP 4 additive-nullable enrichment fields (SUPV-SP4-003 revised).
  agentId: z.string().nullable().default(null),
  agentClass: AgentClassSchema.nullable().default(null),
  runId: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  traceId: z.string().nullable().default(null),
  toolCall: GatewayToolCallSchema.nullable().default(null),
  routingTarget: SupervisorRoutingTargetSchema.nullable().default(null),
  lifecycleTransition: SupervisorLifecycleTransitionSchema.nullable().default(null),
  // SP 4 additive — optional per-action claim (for SUP-004 missing-authorization
  // detection). When absent, SUP-004 contract-grounded no-fire.
  actionClaim: z
    .object({
      actionCategory: z.string().min(1),
      actionRef: z.string().min(1),
    })
    .strict()
    .nullable()
    .default(null),
});
export type SupervisorObservation = z.infer<typeof SupervisorObservationSchema>;
