/**
 * Sandbox domain types for Nous-OSS.
 *
 * Supports the ISandbox interface.
 */
import { z } from 'zod';
import {
  OriginClassSchema,
} from './package-manifest.js';
import { PackageTypeSchema } from './enums.js';
import { PackageLifecycleReasonCodeSchema } from './package-lifecycle.js';

export const SandboxAdmissionSchema = z.object({
  signature_valid: z.boolean(),
  signer_known: z.boolean(),
  api_compatible: z.boolean(),
  policy_compatible: z.boolean(),
  is_draft_unsigned: z.boolean().default(false),
  is_imported: z.boolean().default(false),
  reverification_complete: z.boolean().default(true),
  reapproval_complete: z.boolean().default(true),
});
export type SandboxAdmission = z.infer<typeof SandboxAdmissionSchema>;

export const SandboxActionSchema = z.object({
  surface: z.string().min(1),
  action: z.string().min(1),
  requested_capability: z.string().min(1),
  requires_approval: z.boolean().default(true),
  direct_access_target: z.enum(['none', 'filesystem', 'network', 'runtime']).default('none'),
});
export type SandboxAction = z.infer<typeof SandboxActionSchema>;

export const CapabilityGrantSchema = z.object({
  grant_id: z.string().min(1),
  package_id: z.string().min(1),
  project_id: z.string().min(1),
  capability: z.string().min(1),
  approved_by: z.string().min(1),
  confirmation_proof_ref: z.string().min(1),
  nonce: z.string().min(1),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  scope: z.object({
    action_surfaces: z.array(z.string().min(1)).min(1),
    action_names: z.array(z.string().min(1)).optional(),
  }),
  status: z.enum(['active', 'revoked', 'expired', 'consumed']),
});
export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>;

export const SandboxRuntimeContextSchema = z.object({
  project_id: z.string().min(1),
  policy_profile: z.string().min(1),
  control_state: z.enum(['running', 'paused_review', 'hard_stopped', 'resuming']),
  trace_id: z.string().min(1).optional(),
});
export type SandboxRuntimeContext = z.infer<typeof SandboxRuntimeContextSchema>;

// --- Sandbox Payload ---
// Request entering the governed package runtime membrane.
export const SandboxPayloadSchema = z.object({
  source: z.string().min(1),
  package_id: z.string().min(1),
  package_version: z.string().min(1),
  package_type: PackageTypeSchema,
  origin_class: OriginClassSchema,
  declared_capabilities: z.array(z.string().min(1)).min(1),
  admission: SandboxAdmissionSchema,
  action: SandboxActionSchema,
  runtime: SandboxRuntimeContextSchema,
  capability_grant: CapabilityGrantSchema.optional(),
  timeoutMs: z.number().positive().optional(),
  memoryLimitMb: z.number().positive().optional(),
});
export type SandboxPayload = z.infer<typeof SandboxPayloadSchema>;

export const SandboxDecisionSchema = z
  .object({
    decision: z.enum(['allow', 'deny', 'quarantine']),
    reason_code: PackageLifecycleReasonCodeSchema.optional(),
    witness_ref: z.string().min(1).optional(),
    approval_ref: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision !== 'allow' && !value.reason_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'reason_code is required for deny/quarantine decisions',
      });
    }
  });
export type SandboxDecision = z.infer<typeof SandboxDecisionSchema>;

// --- Sandbox Result ---
// Result of sandbox execution.
export const SandboxResultSchema = z.object({
  success: z.boolean().default(false),
  decision: SandboxDecisionSchema,
  output: z.unknown(),
  error: z.string().optional(),
  resourceUsage: z.object({
    durationMs: z.number().min(0),
    memoryMb: z.number().min(0),
  }),
});
export type SandboxResult = z.infer<typeof SandboxResultSchema>;
