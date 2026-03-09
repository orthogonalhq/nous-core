/**
 * Ingress dispatch outcome types for Nous-OSS.
 *
 * Phase 5.3 — Automation Gateway Ingress and Dispatch Admission.
 * Canonical source: automation-gateway-ingress-architecture-v1.md
 */
import { WorkflowExecutionIdSchema } from './ids.js';
import { z } from 'zod';

export const IngressRejectReasonSchema = z.enum([
  'unauthenticated',
  'scope_mismatch',
  'event_forbidden',
  'policy_blocked',
  'replay_detected',
  'rate_limited',
  'invalid_envelope',
  'control_state_blocked',
  'workflow_admission_blocked',
]);
export type IngressRejectReason = z.infer<typeof IngressRejectReasonSchema>;

export const IngressDispatchOutcomeSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('accepted_dispatched'),
    run_id: WorkflowExecutionIdSchema,
    dispatch_ref: z.string().min(1),
    workflow_ref: z.string().min(1),
    policy_ref: z.string().min(1),
    evidence_ref: z.string().min(1),
  }),
  z.object({
    outcome: z.literal('accepted_already_dispatched'),
    run_id: WorkflowExecutionIdSchema,
    dispatch_ref: z.string().min(1),
    evidence_ref: z.string().min(1),
  }),
  z.object({
    outcome: z.literal('rejected'),
    reason: IngressRejectReasonSchema,
    reason_code: z.string().min(1).optional(),
    evidence_ref: z.string().min(1),
    evidence_refs: z.array(z.string().min(1)).min(1),
  }),
]);
export type IngressDispatchOutcome = z.infer<typeof IngressDispatchOutcomeSchema>;
