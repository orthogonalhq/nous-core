/**
 * Confidence-governance coupling and Phase 6 export types for Nous-OSS.
 *
 * Phase 4.4: Confidence tier mapping, explainability, escalation signals,
 * and Phase 6 intake contracts.
 */
import { z } from 'zod';
import {
  MemoryEntryIdSchema,
  ProjectIdSchema,
  TraceIdSchema,
} from './ids.js';
import { GovernanceLevelSchema, MemoryScopeSchema } from './enums.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';
import type { CriticalActionCategory } from './evidence.js';

// --- Confidence Tier ---
// Maps from ConfidenceLifecycleSchema thresholds (Phase 4.3):
// low:    confidence < 0.6 OR supportingSignals < 5
// medium: confidence in [0.6, 0.9) AND supportingSignals in [5, 15)
// high:   confidence >= 0.9 AND supportingSignals >= 15
export const ConfidenceTierSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceTier = z.infer<typeof ConfidenceTierSchema>;

// --- Confidence Governance Mapping ---
// Explicit mapping from tier to governance behavior. No opaque autonomy.
export const ConfidenceGovernanceMappingSchema = z.object({
  tier: ConfidenceTierSchema,
  escalationRequired: z.boolean(),
  mayAutonomyAllowed: z.boolean(),
  shouldFlagDeviations: z.boolean(),
  maxGovernanceForAutonomy: GovernanceLevelSchema.optional(),
});
export type ConfidenceGovernanceMapping = z.infer<
  typeof ConfidenceGovernanceMappingSchema
>;

// Canonical mapping per SDS
export const CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING: ConfidenceGovernanceMapping[] =
  [
    {
      tier: 'low',
      escalationRequired: true,
      mayAutonomyAllowed: false,
      shouldFlagDeviations: true,
    },
    {
      tier: 'medium',
      escalationRequired: false,
      mayAutonomyAllowed: false,
      shouldFlagDeviations: true,
    },
    {
      tier: 'high',
      escalationRequired: false,
      mayAutonomyAllowed: true,
      shouldFlagDeviations: false,
      maxGovernanceForAutonomy: 'may',
    },
  ];

// --- High-Risk Action Categories (ADR-004 Override) ---
// Regardless of confidence tier, these always require confirmation/authorization.
export const HIGH_RISK_ACTION_CATEGORIES: CriticalActionCategory[] = [
  'tool-execute',
  'memory-write',
  'opctl-command',
];

// --- Learned Behavior Explanation ---
// What pattern influenced which outcome; trace links to canonical truth.
export const LearnedBehaviorExplanationSchema = z.object({
  patternId: MemoryEntryIdSchema,
  outcomeRef: z.string().min(1),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  distillationRef: z.string().optional(),
  policyRef: z.string().optional(),
  controlStateRef: z.string().optional(),
});
export type LearnedBehaviorExplanation = z.infer<
  typeof LearnedBehaviorExplanationSchema
>;

// --- Escalation Signal ---
// Deterministic failure and rollback signaling for low-confidence or contradiction.
export const EscalationSignalReasonCodeSchema = z.enum([
  'CONF-LOW',
  'CONF-CONTRADICTION',
  'CONF-STALENESS',
  'CONF-RETIREMENT',
]);
export type EscalationSignalReasonCode = z.infer<
  typeof EscalationSignalReasonCodeSchema
>;

export const EscalationSignalSchema = z.object({
  reasonCode: EscalationSignalReasonCodeSchema,
  traceId: TraceIdSchema,
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
  patternId: MemoryEntryIdSchema.optional(),
  detail: z.record(z.unknown()).optional(),
});
export type EscalationSignal = z.infer<typeof EscalationSignalSchema>;

// --- Phase 6 Export Contracts ---

export const Phase6DistilledPatternExportSchema = z.object({
  id: MemoryEntryIdSchema,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  basedOn: z.array(MemoryEntryIdSchema),
  supersedes: z.array(MemoryEntryIdSchema),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema),
  projectId: ProjectIdSchema.optional(),
  scope: MemoryScopeSchema,
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Phase6DistilledPatternExport = z.infer<
  typeof Phase6DistilledPatternExportSchema
>;

export const Phase6ConfidenceSignalExportSchema = z.object({
  tier: ConfidenceTierSchema,
  confidence: z.number().min(0).max(1),
  supportingSignals: z.number().int().min(0),
  patternId: MemoryEntryIdSchema.optional(),
  entryId: MemoryEntryIdSchema.optional(),
  decayState: z
    .enum(['stable', 'decaying', 'flagged_retirement'])
    .optional(),
});
export type Phase6ConfidenceSignalExport = z.infer<
  typeof Phase6ConfidenceSignalExportSchema
>;

export const Phase6EvidenceLinkageExpectationsSchema = z.object({
  traceLinksRequired: z.boolean(),
  canonicalRefsRequired: z.boolean(),
  deterministicLinkage: z.boolean(),
});
export type Phase6EvidenceLinkageExpectations = z.infer<
  typeof Phase6EvidenceLinkageExpectationsSchema
>;
