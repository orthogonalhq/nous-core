/**
 * Workmode contract types for Nous-OSS.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 * Canonical source: work-operation-modes-architecture-v1.md
 */
import { z } from 'zod';

export const WorkmodeIdSchema = z
  .string()
  .regex(/^(system:[a-z_]+|skill:[a-z0-9-]+:[a-z_]+)$/);
export type WorkmodeId = z.infer<typeof WorkmodeIdSchema>;

export const PolicyGroupSchema = z.enum([
  'system',
  'certified_skill',
  'local_skill',
  'uncertified_skill',
]);
export type PolicyGroup = z.infer<typeof PolicyGroupSchema>;

export const WorkmodeContractSchema = z.object({
  workmode_id: WorkmodeIdSchema,
  entrypoint_ref: z.string().min(1),
  sop_ref: z.string().min(1),
  allowed_artifact_surfaces: z.array(z.string().min(1)),
  default_scope_constraints: z.record(z.unknown()).optional(),
  required_capabilities: z.array(z.string()).optional(),
  admission_requirements: z
    .object({
      require_contract_validation: z.boolean().optional(),
      require_benchmark_evidence: z.boolean().optional(),
      require_attribution_thesis: z.boolean().optional(),
    })
    .optional(),
  policy_group_compatibility: z.array(PolicyGroupSchema),
  version: z.string().min(1),
});
export type WorkmodeContract = z.infer<typeof WorkmodeContractSchema>;
