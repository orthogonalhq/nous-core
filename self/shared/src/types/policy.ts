/**
 * Policy domain types for Nous-OSS.
 *
 * Phase 3.1: Policy reason-code taxonomy and decision-record schema stubs
 * for deterministic cross-project memory access policy enforcement.
 * Runtime policy evaluation is implemented in phase-3.2.
 */
import { z } from 'zod';
import {
  ProjectIdSchema,
  NodeIdSchema,
  TraceIdSchema,
} from './ids.js';

// --- Policy Reason Code ---
// POL-* prefix for policy-specific reason codes. Distinct from MEM-*, OPCTL-*, MAO-*, GTM-*.
export const PolicyReasonCodeSchema = z
  .string()
  .regex(/^POL-[A-Z0-9][A-Z0-9-]*$/);
export type PolicyReasonCode = z.infer<typeof PolicyReasonCodeSchema>;

// Initial taxonomy (stub — phase-3.2 will add enforcement codes)
export const POLICY_REASON_CODES = {
  'POL-DEFAULT': 'Policy default applied',
  'POL-DENIED': 'Access denied by policy',
  'POL-NODE-OVERRIDE': 'Node-level override applied',
  'POL-INVALID-OVERRIDE': 'Node override rejected (not more restrictive)',
} as const;

// --- Policy Decision Record (Stub) ---
// Records the outcome of a policy evaluation for audit. Phase-3.1: schema only.
// Phase-3.2: instantiation and persistence with witness linkage (ADR-002).
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
  occurredAt: z.string().datetime(),
});
export type PolicyDecisionRecord = z.infer<typeof PolicyDecisionRecordSchema>;
