/**
 * Cost governance domain types for Nous-OSS.
 *
 * Model pricing, budget policies, cost accumulators, snapshots, and budget
 * status. All schemas use `.strict()` per codebase convention.
 *
 * Canonical source: cost-type-system-v1.md
 */
import { z } from 'zod';

// --- Model Pricing ---

export const ModelPricingEntrySchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  inputPricePerMillionTokens: z.number().nonnegative(),
  outputPricePerMillionTokens: z.number().nonnegative(),
  effectiveAt: z.string().datetime(),
}).strict();
export type ModelPricingEntry = z.infer<typeof ModelPricingEntrySchema>;

// --- Budget Policy ---

export const BudgetPeriodTypeSchema = z.enum(['monthly', 'weekly', 'none']);
export type BudgetPeriodType = z.infer<typeof BudgetPeriodTypeSchema>;

export const CostBudgetPolicySchema = z.object({
  enabled: z.boolean().default(true),
  hardCeilingDollars: z.number().positive(),
  softThresholdPercent: z.number().min(0).max(100).default(80),
  periodType: BudgetPeriodTypeSchema.default('monthly'),
  periodAnchorDate: z.string().datetime().optional(),
  systemScopeExempt: z.literal(true).default(true),
}).strict();
export type CostBudgetPolicy = z.infer<typeof CostBudgetPolicySchema>;

// --- Cost Accumulation ---

export const CostAccumulatorEntrySchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  inputCostDollars: z.number().nonnegative(),
  outputCostDollars: z.number().nonnegative(),
  totalCostDollars: z.number().nonnegative(),
  callCount: z.number().int().nonnegative(),
}).strict();
export type CostAccumulatorEntry = z.infer<typeof CostAccumulatorEntrySchema>;

// --- Cost Snapshots ---

export const CostWindowSchema = z.enum(['today', 'week', 'month', 'period']);
export type CostWindow = z.infer<typeof CostWindowSchema>;

export const CostSnapshotSchema = z.object({
  projectId: z.string().min(1),
  window: CostWindowSchema,
  windowStart: z.string().datetime(),
  totalCostDollars: z.number().nonnegative(),
  entries: z.array(CostAccumulatorEntrySchema),
  snapshotAt: z.string().datetime(),
}).strict();
export type CostSnapshot = z.infer<typeof CostSnapshotSchema>;

// --- Budget Status ---

export const BudgetAlertLevelSchema = z.enum(['normal', 'soft_threshold', 'hard_ceiling']);
export type BudgetAlertLevel = z.infer<typeof BudgetAlertLevelSchema>;

export const BudgetStatusSchema = z.object({
  projectId: z.string().min(1),
  currentSpendDollars: z.number().nonnegative(),
  hardCeilingDollars: z.number().positive(),
  softThresholdDollars: z.number().nonnegative(),
  percentUsed: z.number().nonnegative(),
  alertLevel: BudgetAlertLevelSchema,
  periodType: BudgetPeriodTypeSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime().optional(),
  isPaused: z.boolean(),
}).strict();
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;
