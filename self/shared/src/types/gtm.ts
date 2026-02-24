/**
 * GTM (Go-To-Market) stage threshold types for Nous-OSS.
 *
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 * Canonical source: gtm-stage-threshold-decision-package-v1.md
 */
import { z } from 'zod';

/** Fixed denominator for CFPC per ratified V1 exhaustive feature-pillar set. */
export const CFPC_DENOMINATOR = 17;

export const GtmStageLabelSchema = z.enum([
  'Closed Cohort',
  'Open Beta',
  'GA',
]);
export type GtmStageLabel = z.infer<typeof GtmStageLabelSchema>;

export const GtmPillarStatusSchema = z.object({
  pillar_index: z.number().int().min(1).max(17),
  working_in_production: z.boolean(),
  blocked_by_s0: z.boolean(),
});
export type GtmPillarStatus = z.infer<typeof GtmPillarStatusSchema>;

export const GtmPillarStatusSourceSchema = z.enum([
  'config',
  'registry',
  'manual',
]);
export type GtmPillarStatusSource = z.infer<typeof GtmPillarStatusSourceSchema>;

export const GtmGateReportInputSchema = z.object({
  verification_report_ref: z.string().min(1),
  pillar_status_source: GtmPillarStatusSourceSchema,
  pillar_status: z.array(GtmPillarStatusSchema),
  benchmark_result_ref: z.string().min(1).optional(),
  canonical_suite_ref: z.string().min(1),
  passed_agent_benchmark_tests: z.number().int().nonnegative(),
  total_agent_benchmark_tests: z.number().int().positive(),
  current_stage: GtmStageLabelSchema,
  open_s0_count: z.number().int().nonnegative(),
});
export type GtmGateReportInput = z.infer<typeof GtmGateReportInputSchema>;

export const GtmThresholdBandSchema = z.object({
  cfpc_min: z.number().min(0).max(1),
  abpr_min: z.number().min(0).max(1),
});
export type GtmThresholdBand = z.infer<typeof GtmThresholdBandSchema>;

export const GtmGateReportSchema = z.object({
  current_stage: GtmStageLabelSchema,
  cfpc: z.number().min(0).max(1),
  abpr: z.number().min(0).max(1),
  open_s0_count: z.number().int().nonnegative(),
  promotion_blocked: z.boolean(),
  threshold_bands: z.record(z.string(), GtmThresholdBandSchema),
  pillar_status: z.array(GtmPillarStatusSchema),
  generated_at: z.string().datetime(),
});
export type GtmGateReport = z.infer<typeof GtmGateReportSchema>;
