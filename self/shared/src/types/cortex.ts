/**
 * Cortex domain secondary types for Nous-OSS.
 *
 * These support the IPfcEngine and ICoreExecutor interfaces.
 */
import { z } from 'zod';
import { ProjectIdSchema, TraceIdSchema, MemoryEntryIdSchema } from './ids.js';
import { PfcTierSchema } from './enums.js';
import { MemoryWriteCandidateSchema, StmContextSchema } from './memory.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import { ModelRequirementsSchema, RouteDecisionEvidenceSchema } from './routing.js';
import { PolicyDecisionRecordSchema } from './policy.js';

// --- Cortex Decision ---
// Result of a Cortex evaluation — approve or deny with reason and confidence.
export const PfcDecisionSchema = z.object({
  approved: z.boolean(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});
export type PfcDecision = z.infer<typeof PfcDecisionSchema>;

// --- Reflection Context ---
// Context provided for Cortex reflection.
export const ReflectionContextSchema = z.object({
  output: z.unknown(),
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
  tier: PfcTierSchema,
});
export type ReflectionContext = z.infer<typeof ReflectionContextSchema>;

// --- Reflection Result ---
// Result of a Cortex reflection pass.
export const ReflectionResultSchema = z.object({
  confidence: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  flags: z.array(z.string()),
  shouldEscalate: z.boolean(),
  notes: z.string().optional(),
});
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

// --- Escalation Situation ---
// The situation being evaluated for escalation.
export const EscalationSituationSchema = z.object({
  trigger: z.string(),
  context: z.string(),
  confidence: z.number().min(0).max(1),
  projectId: ProjectIdSchema.optional(),
});
export type EscalationSituation = z.infer<typeof EscalationSituationSchema>;

// --- Escalation Decision ---
// Whether to escalate, and how.
export const EscalationDecisionSchema = z.object({
  shouldEscalate: z.boolean(),
  reason: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  suggestedChannel: z.enum(['in-app', 'push', 'signal', 'slack', 'sms', 'email', 'voice']).optional(),
});
export type EscalationDecision = z.infer<typeof EscalationDecisionSchema>;

// --- Turn Input ---
// Input for a single agent turn.
export const TurnInputSchema = z.object({
  message: z.string(),
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
  stmContext: StmContextSchema.optional(),
  /** Model routing requirements (Phase 2.3). Default: review-standard, block_if_unmet */
  modelRequirements: ModelRequirementsSchema.optional(),
  /** When true, allow dispatch below capability threshold with PRV-PRINCIPAL-OVERRIDE evidence */
  principalOverrideEvidence: z.boolean().optional(),
});
export type TurnInput = z.infer<typeof TurnInputSchema>;

// --- Turn Result ---
// Result of a single agent turn.
export const TurnResultSchema = z.object({
  response: z.string(),
  traceId: TraceIdSchema,
  memoryCandidates: z.array(MemoryWriteCandidateSchema),
  pfcDecisions: z.array(PfcDecisionSchema),
});
export type TurnResult = z.infer<typeof TurnResultSchema>;

// --- Execution Trace ---
// Full trace of an execution.
export const ExecutionTraceSchema = z.object({
  traceId: TraceIdSchema,
  projectId: ProjectIdSchema.optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  turns: z.array(
    z.object({
      input: z.string(),
      output: z.string(),
      modelCalls: z.array(
        z.object({
          providerId: z.string(),
          role: z.string(),
          inputTokens: z.number().int().min(0).optional(),
          outputTokens: z.number().int().min(0).optional(),
          durationMs: z.number().min(0).optional(),
          routeEvidence: RouteDecisionEvidenceSchema.optional(),
        }),
      ),
      pfcDecisions: z.array(PfcDecisionSchema),
      toolDecisions: z
        .array(
          z.object({
            toolName: z.string(),
            approved: z.boolean(),
            reason: z.string().optional(),
          }),
        )
        .default([]),
      memoryWrites: z.array(MemoryEntryIdSchema),
      memoryDenials: z.array(z.object({
        candidate: MemoryWriteCandidateSchema,
        reason: z.string(),
        decisionRecord: PolicyDecisionRecordSchema.optional(),
      })),
      evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
      timestamp: z.string().datetime(),
    }),
  ),
});
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;
