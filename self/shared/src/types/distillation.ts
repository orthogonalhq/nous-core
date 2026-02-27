/**
 * Distillation domain types for Nous-OSS.
 *
 * Phase 4.3: Clustering config, confidence lifecycle, supersession reversal.
 */
import { z } from 'zod';
import {
  MemoryEntryIdSchema,
  ProjectIdSchema,
} from './ids.js';
import { TraceEvidenceReferenceSchema } from './evidence.js';

// --- Distillation Cluster Config ---
export const DistillationClusterConfigSchema = z.object({
  minClusterSize: z.number().int().min(2).max(50),
  maxClusterSize: z.number().int().min(3).max(100),
  clusteringStrategy: z.enum(['tag', 'project', 'semantic']),
  semanticSimilarityThreshold: z.number().min(0).max(1).optional(),
  tagOverlapMin: z.number().int().min(1).optional(),
});
export type DistillationClusterConfig = z.infer<
  typeof DistillationClusterConfigSchema
>;

export const DEFAULT_DISTILLATION_CLUSTER_CONFIG: DistillationClusterConfig = {
  minClusterSize: 3,
  maxClusterSize: 25,
  clusteringStrategy: 'project',
};

// --- Confidence Lifecycle ---
export const ConfidenceLifecycleSchema = z.object({
  minSupportingSignals: z.number().int().min(3),
  highConfidenceThreshold: z.number().min(0.9).max(1),
  highConfidenceMinSignals: z.number().int().min(15),
  mediumConfidenceMinSignals: z.number().int().min(5),
  refreshIncrement: z.number().min(0).max(0.1),
  stalenessDecayPerDay: z.number().min(0).max(0.05),
  contradictionDecay: z.number().min(0).max(0.2),
  contradictionRetirementThreshold: z.number().min(0).max(0.5),
});
export type ConfidenceLifecycle = z.infer<typeof ConfidenceLifecycleSchema>;

export const DEFAULT_CONFIDENCE_LIFECYCLE: ConfidenceLifecycle = {
  minSupportingSignals: 3,
  highConfidenceThreshold: 0.9,
  highConfidenceMinSignals: 15,
  mediumConfidenceMinSignals: 5,
  refreshIncrement: 0.02,
  stalenessDecayPerDay: 0.01,
  contradictionDecay: 0.1,
  contradictionRetirementThreshold: 0.4,
};

// --- Confidence Refresh Input ---
export const ConfidenceRefreshInputSchema = z.object({
  patternId: MemoryEntryIdSchema,
  confirmingRecordId: MemoryEntryIdSchema,
  alignmentScore: z.number().min(0).max(1),
});
export type ConfidenceRefreshInput = z.infer<
  typeof ConfidenceRefreshInputSchema
>;

// --- Confidence Decay Input ---
export const ConfidenceDecayInputSchema = z.object({
  patternId: MemoryEntryIdSchema,
  reason: z.enum(['staleness', 'contradiction']),
  contradictingRecordId: MemoryEntryIdSchema.optional(),
  stalenessDays: z.number().min(0).optional(),
});
export type ConfidenceDecayInput = z.infer<typeof ConfidenceDecayInputSchema>;

// --- Confidence Update Result ---
export const ConfidenceUpdateResultSchema = z.object({
  newConfidence: z.number().min(0).max(1),
  flaggedForRetirement: z.boolean(),
});
export type ConfidenceUpdateResult = z.infer<
  typeof ConfidenceUpdateResultSchema
>;

// --- Supersession Reversal Request ---
export const SupersessionReversalRequestSchema = z.object({
  patternId: MemoryEntryIdSchema,
  reason: z.string().min(1),
  evidenceRefs: z.array(TraceEvidenceReferenceSchema).min(1),
});
export type SupersessionReversalRequest = z.infer<
  typeof SupersessionReversalRequestSchema
>;
