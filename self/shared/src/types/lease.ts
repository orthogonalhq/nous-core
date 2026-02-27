/**
 * Lease contract types for Nous-OSS.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Canonical source: work-operation-modes-architecture-v1.md
 */
import { z } from 'zod';
import { LeaseIdSchema } from './ids.js';
import { WorkmodeIdSchema } from './workmode.js';

export const LeaseContractSchema = z.object({
  lease_id: LeaseIdSchema,
  project_run_id: z.string().uuid(),
  workmode_id: WorkmodeIdSchema,
  entrypoint_ref: z.string().min(1),
  sop_ref: z.string().min(1),
  scope_ref: z.string().min(1),
  context_profile: z.string().min(1),
  ttl: z.number().int().positive(),
  budget_ref: z.string().optional(),
  issued_by: z.literal('nous_cortex'),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  revocation_ref: z.string().nullable(),
});
export type LeaseContract = z.infer<typeof LeaseContractSchema>;
