/**
 * Routing and failover types for Nous-OSS.
 *
 * Phase 2.3: Provider profile breadth and failover hardening.
 * ModelRequirements, RouteContext, RouteResult, and failover reason codes.
 */
import { z } from 'zod';
import { ProviderIdSchema, ProjectIdSchema, TraceIdSchema } from './ids.js';

// --- Model Requirements (from model-capability-contract.md) ---
export const ModelRequirementsSchema = z.object({
  profile: z.string(),
  fallbackPolicy: z.enum(['block_if_unmet', 'principal-override']),
});
export type ModelRequirements = z.infer<typeof ModelRequirementsSchema>;

// --- Route Context ---
export const RouteContextSchema = z.object({
  projectId: ProjectIdSchema.optional(),
  traceId: TraceIdSchema,
  modelRequirements: ModelRequirementsSchema,
  /** When true and PRV-THRESHOLD-MISS would occur, allow dispatch with PRV-PRINCIPAL-OVERRIDE evidence */
  principalOverrideEvidence: z.boolean().optional(),
});
export type RouteContext = z.infer<typeof RouteContextSchema>;

// --- Route Decision Evidence ---
export const RouteDecisionEvidenceSchema = z.object({
  profileId: z.string(),
  policyLink: z.string(),
  capabilityProfile: z.string(),
  selectedProviderId: ProviderIdSchema,
  failoverHop: z.number().int().min(0).optional(),
  failoverReasonCode: z.string().optional(),
});
export type RouteDecisionEvidence = z.infer<typeof RouteDecisionEvidenceSchema>;

// --- Route Result ---
export const RouteResultSchema = z.object({
  providerId: ProviderIdSchema,
  evidence: RouteDecisionEvidenceSchema,
});
export type RouteResult = z.infer<typeof RouteResultSchema>;

// --- Failover Reason Codes (PRV-*) ---
export const FailoverReasonCodeSchema = z.enum([
  'PRV-PROFILE-BOUNDARY',
  'PRV-THRESHOLD-MISS',
  'PRV-AUTH-FAILURE',
  'PRV-PROVIDER-UNAVAILABLE',
  'PRV-RATE-LIMIT',
  'PRV-HOP-LIMIT',
  'PRV-PRINCIPAL-OVERRIDE',
]);
export type FailoverReasonCode = z.infer<typeof FailoverReasonCodeSchema>;

// --- Standard Capability Profiles (from model-capability-contract.md) ---
export const STANDARD_CAPABILITY_PROFILES = [
  'review-standard',
  'review-implementation',
  'prompt-generation',
  'planning-decomposition',
] as const;
export type StandardCapabilityProfile =
  (typeof STANDARD_CAPABILITY_PROFILES)[number];
