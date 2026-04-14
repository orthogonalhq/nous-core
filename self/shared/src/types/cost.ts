/**
 * Cost domain types for Nous-OSS.
 *
 * Derived from ratified decisions:
 *   - cost-event-schema-v1.md — CostEvent, PricingTier, event channels
 *   - budget-policy-model-v1.md — BudgetPolicy, period semantics, threshold semantics
 *
 * All schemas are self-contained Zod definitions. Inferred TypeScript types
 * are exported alongside each schema.
 */
import { z } from 'zod';

// --- Cost Event (one per inference call) ---

export const CostEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  projectId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  agentClass: z.string().optional(),
  correlationRunId: z.string(),
  correlationParentId: z.string().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  inputCostUsd: z.number().nonnegative(),
  outputCostUsd: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  pricingMiss: z.boolean().optional(),
});
export type CostEvent = z.infer<typeof CostEventSchema>;

// --- Budget Policy (stored on ProjectConfig) ---

export const BudgetPolicySchema = z.object({
  enabled: z.boolean(),
  period: z.enum(['monthly', 'weekly']),
  softThresholdPercent: z.number().min(0).max(100),
  hardCeilingUsd: z.number().nonnegative(),
  perAgentCaps: z.record(z.string(), z.number().nonnegative()).optional(),
});
export type BudgetPolicy = z.infer<typeof BudgetPolicySchema>;

// --- Budget Status (runtime state for queries) ---

export const BudgetStatusSchema = z.object({
  hasBudget: z.boolean(),
  currentSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
  utilizationPercent: z.number().nonnegative(),
  softAlertFired: z.boolean(),
  hardCeilingFired: z.boolean(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  projectControlState: z.string(),
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

// --- Cost Breakdown Entry (aggregation row) ---

export const CostBreakdownEntrySchema = z.object({
  key: z.string(),
  totalCostUsd: z.number().nonnegative(),
  inputCostUsd: z.number().nonnegative(),
  outputCostUsd: z.number().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});
export type CostBreakdownEntry = z.infer<typeof CostBreakdownEntrySchema>;

// --- Cost Summary (period-level aggregation) ---

export const CostSummarySchema = z.object({
  totalCostUsd: z.number().nonnegative(),
  totalInputCostUsd: z.number().nonnegative(),
  totalOutputCostUsd: z.number().nonnegative(),
  totalEvents: z.number().int().nonnegative(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  topProvider: z.string().optional(),
  topModel: z.string().optional(),
});
export type CostSummary = z.infer<typeof CostSummarySchema>;

// --- Cost Time Series Bucket ---

export const CostTimeSeriesBucketSchema = z.object({
  bucketStart: z.string().datetime(),
  totalCostUsd: z.number().nonnegative(),
  eventCount: z.number().int().nonnegative(),
});
export type CostTimeSeriesBucket = z.infer<typeof CostTimeSeriesBucketSchema>;

// --- Event Bus Payloads ---

export const CostSnapshotPayloadSchema = z.object({
  projectId: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  totalSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
  utilizationPercent: z.number().nonnegative(),
  byProvider: z.record(z.string(), z.number().nonnegative()),
  byAgentClass: z.record(z.string(), z.number().nonnegative()),
});
export type CostSnapshotPayload = z.infer<typeof CostSnapshotPayloadSchema>;

export const BudgetAlertPayloadSchema = z.object({
  projectId: z.string(),
  utilizationPercent: z.number().nonnegative(),
  thresholdPercent: z.number().min(0).max(100),
  currentSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
});
export type BudgetAlertPayload = z.infer<typeof BudgetAlertPayloadSchema>;

export const BudgetExceededPayloadSchema = z.object({
  projectId: z.string(),
  utilizationPercent: z.number().nonnegative(),
  currentSpendUsd: z.number().nonnegative(),
  budgetCeilingUsd: z.number().nonnegative(),
});
export type BudgetExceededPayload = z.infer<typeof BudgetExceededPayloadSchema>;

// --- Pricing ---

export const PricingTierSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  inputCostPerMillionTokens: z.number().nonnegative(),
  outputCostPerMillionTokens: z.number().nonnegative(),
});
export type PricingTier = z.infer<typeof PricingTierSchema>;

export type PricingTable = Map<`${string}:${string}`, PricingTier>;
