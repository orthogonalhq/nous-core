/**
 * Policy domain types for Nous-OSS.
 *
 * Phase 3.1: Policy reason-code taxonomy and decision-record schema stubs.
 * Phase 3.2: PolicyAccessContext, PolicyEvaluationResult, extended reason codes,
 * evidenceRefs for ADR-002 witness linkage.
 *
 * ProjectConfigSchema.memoryAccessPolicy absent/default: When absent, consumers
 * apply DEFAULT_MEMORY_ACCESS_POLICY before validation. No implicit inheritance.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  NodeIdSchema,
  TraceIdSchema,
} from './ids.js';
import { MemoryAccessPolicySchema } from './memory.js';
import { NodeMemoryAccessPolicyOverrideSchema } from './project.js';
import { ProjectControlStateSchema } from './mao.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';

// --- Policy Reason Code ---
// POL-* prefix for policy-specific reason codes. Distinct from MEM-*, OPCTL-*, MAO-*, GTM-*.
export const PolicyReasonCodeSchema = z
  .string()
  .regex(/^POL-[A-Z0-9][A-Z0-9-]*$/);
export type PolicyReasonCode = z.infer<typeof PolicyReasonCodeSchema>;

// Taxonomy: Phase 3.1 stubs + Phase 3.2 enforcement codes
export const POLICY_REASON_CODES = {
  'POL-DEFAULT': 'Policy default applied',
  'POL-DENIED': 'Access denied by policy',
  'POL-NODE-OVERRIDE': 'Node-level override applied',
  'POL-INVALID-OVERRIDE': 'Node override rejected (not more restrictive)',
  'POL-CANNOT-READ-FROM': 'fromProject canReadFrom does not include target',
  'POL-CANNOT-BE-READ-BY': 'target canBeReadBy does not include fromProject',
  'POL-GLOBAL-DENIED': 'inheritsGlobal is false; global access denied',
  'POL-CONTROL-STATE-BLOCKED': 'projectControlState is hard_stopped; all access blocked',
  'POL-PAUSED-BLOCKED': 'projectControlState is paused_review; access blocked',
} as const;

// --- Policy Decision Record ---
// Records the outcome of a policy evaluation for audit. Phase-3.2: evidenceRefs for ADR-002.
export const PolicyDecisionRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: ProjectIdSchema,
  targetProjectId: ProjectIdSchema.optional(),
  action: z.enum(['read', 'write', 'retrieve']),
  outcome: z.enum(['allowed', 'denied']),
  reasonCode: PolicyReasonCodeSchema,
  reason: z.string(),
  nodeId: NodeIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).default([]),
  occurredAt: z.string().datetime(),
});
export type PolicyDecisionRecord = z.infer<typeof PolicyDecisionRecordSchema>;

// --- Policy Access Context (Phase 3.2) ---
// Input to policy evaluation. Action-specific required fields validated at evaluate() entry.
export const PolicyAccessContextSchema = z.object({
  action: z.enum(['read', 'write', 'retrieve']),
  fromProjectId: ProjectIdSchema,
  targetProjectId: ProjectIdSchema.optional(),
  targetProjectIds: z.array(ProjectIdSchema).optional(),
  includeGlobal: z.boolean(),
  projectPolicy: MemoryAccessPolicySchema,
  targetProjectPolicy: MemoryAccessPolicySchema.optional(),
  targetProjectPolicies: z.record(z.string(), MemoryAccessPolicySchema).optional(),
  nodeOverride: NodeMemoryAccessPolicyOverrideSchema.optional(),
  projectControlState: ProjectControlStateSchema.optional(),
  traceId: TraceIdSchema.optional(),
  nodeId: NodeIdSchema.optional(),
});
export type PolicyAccessContext = z.infer<typeof PolicyAccessContextSchema>;

// --- Policy Evaluation Result (Phase 3.2) ---
export const PolicyEvaluationResultSchema = z.object({
  allowed: z.boolean(),
  reasonCode: PolicyReasonCodeSchema,
  reason: z.string(),
  decisionRecord: PolicyDecisionRecordSchema,
});
export type PolicyEvaluationResult = z.infer<
  typeof PolicyEvaluationResultSchema
>;
