/**
 * Admission and workmode event types for Nous-OSS.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Canonical source: work-operation-modes-architecture-v1.md
 */
import { z } from 'zod';
import type { InvariantCode } from './evidence.js';
import { InvariantCodeSchema } from './evidence.js';

/** Scope guard reason codes for dispatch admission. */
export const SCOPE_GUARD_CODES = {
  /** Scope guard context required but missing or invalid */
  SCOPE_GUARD_VIOLATION: 'WMODE-SCOPE-GUARD-VIOLATION' as InvariantCode,
  /** Packet admissibility rejected at node entry validation */
  PACKET_ADMISSIBILITY_REJECTED: 'WMODE-PACKET-ADMISSIBILITY-REJECTED' as InvariantCode,
} as const;

export const AdmissionResultSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true) }),
  z.object({
    allowed: z.literal(false),
    reasonCode: InvariantCodeSchema,
    evidenceRefs: z.array(z.string().min(1)).min(1),
    detail: z.record(z.unknown()).optional(),
  }),
]);
export type AdmissionResult = z.infer<typeof AdmissionResultSchema>;

export const WorkmodeEventTypeSchema = z.enum([
  'wmode_registration_requested',
  'wmode_registered',
  'wmode_registration_rejected',
  'wmode_activation_requested',
  'wmode_activation_allowed',
  'wmode_activation_blocked',
  'wmode_transition_requested',
  'wmode_transition_committed',
  'wmode_transition_blocked',
  'wmode_boundary_violation_blocked',
  'wmode_policy_group_gate_applied',
  'wmode_lease_issued',
  'wmode_lease_revoked',
  'wmode_lease_expired',
  'wmode_context_profile_switched',
  'wmode_authority_violation_blocked',
  'wmode_skill_admission_requested',
  'wmode_skill_admission_blocked',
  'wmode_skill_promoted',
  'wmode_skill_held',
  'wmode_skill_rolled_back',
]);
export type WorkmodeEventType = z.infer<typeof WorkmodeEventTypeSchema>;

export const LifecycleActionSchema = z.enum([
  'start',
  'pause',
  'resume',
  'stop',
  'recover',
]);
export type LifecycleAction = z.infer<typeof LifecycleActionSchema>;
