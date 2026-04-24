/**
 * Security evidence-chain types for Nous-OSS.
 *
 * These contracts define the Phase 2.1 witness baseline:
 * events, checkpoints, invariants, verification reports, and attestation.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  TraceIdSchema,
  WitnessEventIdSchema,
  WitnessCheckpointIdSchema,
  VerificationReportIdSchema,
  AttestationReceiptIdSchema,
} from './ids.js';

// WR-162 SP 6 (SUPV-SP6-009 Option A) — widened to include 'S3' so that the
// authoritative SP 1 mapping `SUPERVISOR_INVARIANT_SEVERITY_MAP` for
// SUP-009..SUP-012 (sentinel-model-contract-v1.md § Severity Tier) is admitted
// at the type level. The 'S3' literal is the sentinel warn-only tier; S0/S1/S2
// remain the enforcement tiers (hard-stop/auto-pause/review).
export const InvariantSeveritySchema = z.enum(['S0', 'S1', 'S2', 'S3']);
export type InvariantSeverity = z.infer<typeof InvariantSeveritySchema>;

// WR-162 SP 6 (SUPV-SP6-009 Option A) — widened to include 'warn' (kebab-case
// per this schema's convention; distinct from the snake_case
// `SupervisorEnforcementActionPayloadSchema.action` union). 'warn' is the
// advisory S3 enforcement posture — sentinel classifies and emits a warning
// trail but does NOT dispatch an opctl command (per
// supervisor-escalation-policy-v1.md § S3 Warn Path).
export const EnforcementActionSchema = z.enum([
  'hard-stop',
  'auto-pause',
  'review',
  'warn',
]);
export type EnforcementAction = z.infer<typeof EnforcementActionSchema>;

export const InvariantPrefixSchema = z.enum([
  'AUTH',
  'EVID',
  'MEM',
  'CHAIN',
  'ISO',
  'PRV',
  'OPCTL',
  'START',
  'ESC',
  'MAO',
  'GTM',
  'POL',
  'WMODE',
  'PCP',
  'ING',
  'FR',
  // WR-162 SP 4 — supervisor invariant prefix (SUP-001..SUP-012 per
  // supervisor-violation-taxonomy-v1.md). See SUPV-SP4-006 for witnessd
  // registration scope (SUP-001..SUP-008 in SP 4; SUP-009..SUP-012 deferred
  // to SP 6 alongside `InvariantSeveritySchema`/`EnforcementActionSchema`
  // widening).
  'SUP',
]);
export type InvariantPrefix = z.infer<typeof InvariantPrefixSchema>;

export const InvariantCodeSchema = z
  .string()
  .regex(
    /^(AUTH|EVID|MEM|CHAIN|ISO|PRV|OPCTL|START|ESC|MAO|GTM|POL|WMODE|PCP|ING|FR|SUP)-[A-Z0-9][A-Z0-9-]*$/,
  );
export type InvariantCode = z.infer<typeof InvariantCodeSchema>;

export const CriticalActionCategorySchema = z.enum([
  'model-invoke',
  'tool-execute',
  'memory-write',
  'trace-persist',
  'opctl-command',
  'mao-projection',
  // WR-162 SP 4 — supervisor-authored action categories per
  // supervisor-evidence-contract-v1.md § New CriticalActionCategory Values.
  // Mirrors `SUPERVISOR_CRITICAL_ACTION_CATEGORIES` in
  // `./supervisor-invariants.ts` (SP 1 type-only constant; SP 4 extends the
  // runtime Zod schema to match).
  'supervisor-detection',
  'supervisor-enforcement',
]);
export type CriticalActionCategory = z.infer<typeof CriticalActionCategorySchema>;

export const WitnessEventStageSchema = z.enum([
  'authorization',
  'completion',
  'invariant',
]);
export type WitnessEventStage = z.infer<typeof WitnessEventStageSchema>;

export const WitnessActorSchema = z.enum([
  'core',
  'pfc',
  'subcortex',
  'app',
  'principal',
  'system',
  'orchestration_agent',
  'worker_agent',
  // WR-162 SP 5 — widens for supervisor witness emission (SUPV-SP5-007/008).
  // Flipped in `self/subcortex/supervisor/src/witness-emission.ts` from
  // `actor: 'system'` + `detail.supervisorActor: 'supervisor'` breadcrumb.
  'supervisor',
]);
export type WitnessActor = z.infer<typeof WitnessActorSchema>;

export const WitnessEventStatusSchema = z.enum([
  'approved',
  'denied',
  'succeeded',
  'failed',
  'blocked',
]);
export type WitnessEventStatus = z.infer<typeof WitnessEventStatusSchema>;

export const WitnessEventSchema = z.object({
  id: WitnessEventIdSchema,
  sequence: z.number().int().positive(),
  previousEventHash: z.string().min(1).nullable(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  eventHash: z.string().regex(/^[a-f0-9]{64}$/),
  stage: WitnessEventStageSchema,
  actionCategory: CriticalActionCategorySchema,
  actionRef: z.string().min(1),
  authorizationRef: WitnessEventIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  actor: WitnessActorSchema,
  status: WitnessEventStatusSchema,
  invariantCode: InvariantCodeSchema.optional(),
  detail: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});
export type WitnessEvent = z.infer<typeof WitnessEventSchema>;

export const WitnessCheckpointReasonSchema = z.enum([
  'interval',
  'manual',
  'rotation',
]);
export type WitnessCheckpointReason = z.infer<typeof WitnessCheckpointReasonSchema>;

export const WitnessSignatureAlgorithmSchema = z.literal('ed25519');
export type WitnessSignatureAlgorithm = z.infer<
  typeof WitnessSignatureAlgorithmSchema
>;

export const WitnessCheckpointSchema = z.object({
  id: WitnessCheckpointIdSchema,
  checkpointSequence: z.number().int().positive(),
  startEventSequence: z.number().int().nonnegative(),
  endEventSequence: z.number().int().nonnegative(),
  previousCheckpointHash: z.string().min(1).nullable(),
  checkpointHash: z.string().regex(/^[a-f0-9]{64}$/),
  ledgerHeadHash: z.string().regex(/^[a-f0-9]{64}$/),
  keyEpoch: z.number().int().positive(),
  signatureAlgorithm: WitnessSignatureAlgorithmSchema,
  signature: z.string().min(1),
  reason: WitnessCheckpointReasonSchema,
  createdAt: z.string().datetime(),
});
export type WitnessCheckpoint = z.infer<typeof WitnessCheckpointSchema>;

export const InvariantFindingSchema = z.object({
  code: InvariantCodeSchema,
  severity: InvariantSeveritySchema,
  enforcement: EnforcementActionSchema,
  description: z.string(),
  evidenceEventIds: z.array(WitnessEventIdSchema),
  detectedAt: z.string().datetime(),
});
export type InvariantFinding = z.infer<typeof InvariantFindingSchema>;

export const AttestationModeSchema = z.literal('local');
export type AttestationMode = z.infer<typeof AttestationModeSchema>;

export const AttestationSubjectTypeSchema = z.literal('verification-report');
export type AttestationSubjectType = z.infer<typeof AttestationSubjectTypeSchema>;

export const AttestationReceiptSchema = z.object({
  id: AttestationReceiptIdSchema,
  mode: AttestationModeSchema,
  subjectType: AttestationSubjectTypeSchema,
  subjectHash: z.string().regex(/^[a-f0-9]{64}$/),
  keyEpoch: z.number().int().positive(),
  signatureAlgorithm: WitnessSignatureAlgorithmSchema,
  signature: z.string().min(1),
  verified: z.boolean(),
  issuedAt: z.string().datetime(),
});
export type AttestationReceipt = z.infer<typeof AttestationReceiptSchema>;

export const VerificationReportStatusSchema = z.enum([
  'pass',
  'review',
  'fail',
]);
export type VerificationReportStatus = z.infer<
  typeof VerificationReportStatusSchema
>;

export const VerificationRangeSchema = z.object({
  fromSequence: z.number().int().nonnegative(),
  toSequence: z.number().int().nonnegative(),
});
export type VerificationRange = z.infer<typeof VerificationRangeSchema>;

export const VerificationReportSchema = z.object({
  id: VerificationReportIdSchema,
  generatedAt: z.string().datetime(),
  range: VerificationRangeSchema,
  ledger: z.object({
    eventCount: z.number().int().nonnegative(),
    headEventHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    sequenceContiguous: z.boolean(),
    hashChainValid: z.boolean(),
  }),
  checkpoints: z.object({
    checkpointCount: z.number().int().nonnegative(),
    headCheckpointHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    checkpointChainValid: z.boolean(),
    signaturesValid: z.boolean(),
  }),
  invariants: z.object({
    findings: z.array(InvariantFindingSchema),
    bySeverity: z.object({
      S0: z.number().int().nonnegative(),
      S1: z.number().int().nonnegative(),
      S2: z.number().int().nonnegative(),
    }),
  }),
  status: VerificationReportStatusSchema,
  receipt: AttestationReceiptSchema,
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const TraceEvidenceReferenceSchema = z.object({
  actionCategory: CriticalActionCategorySchema,
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  invariantEventId: WitnessEventIdSchema.optional(),
  verificationReportId: VerificationReportIdSchema.optional(),
});
export type TraceEvidenceReference = z.infer<typeof TraceEvidenceReferenceSchema>;

export const WitnessAuthorizationInputSchema = z.object({
  actionCategory: CriticalActionCategorySchema,
  actionRef: z.string().min(1),
  traceId: TraceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  actor: WitnessActorSchema,
  status: z.enum(['approved', 'denied']),
  detail: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});
export type WitnessAuthorizationInput = z.infer<
  typeof WitnessAuthorizationInputSchema
>;

export const WitnessCompletionInputSchema = z.object({
  actionCategory: CriticalActionCategorySchema,
  actionRef: z.string().min(1),
  authorizationRef: WitnessEventIdSchema,
  traceId: TraceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  actor: WitnessActorSchema,
  status: z.enum(['succeeded', 'failed', 'blocked']),
  detail: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});
export type WitnessCompletionInput = z.infer<
  typeof WitnessCompletionInputSchema
>;

export const WitnessInvariantInputSchema = z.object({
  code: InvariantCodeSchema,
  actionCategory: CriticalActionCategorySchema,
  actionRef: z.string().min(1),
  traceId: TraceIdSchema.optional(),
  projectId: ProjectIdSchema.optional(),
  actor: WitnessActorSchema.default('system'),
  detail: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime().optional(),
});
export type WitnessInvariantInput = z.infer<typeof WitnessInvariantInputSchema>;

export const WitnessVerificationRequestSchema = z.object({
  fromSequence: z.number().int().nonnegative().optional(),
  toSequence: z.number().int().nonnegative().optional(),
});
export type WitnessVerificationRequest = z.infer<
  typeof WitnessVerificationRequestSchema
>;

export const InvariantEnforcementDecisionSchema = z.object({
  code: InvariantCodeSchema,
  severity: InvariantSeveritySchema,
  enforcement: EnforcementActionSchema,
});
export type InvariantEnforcementDecision = z.infer<
  typeof InvariantEnforcementDecisionSchema
>;
