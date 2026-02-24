/**
 * GtmGateCalculator — IGtmGateCalculator implementation.
 * Phase 2.6: CFPC/ABPR per ratified formulas; GTM-001 S0 hard stop.
 */
import type {
  GtmGateReportInput,
  GtmGateReport,
  GtmStageLabel,
  GtmThresholdBand,
} from '@nous/shared';
import {
  GtmGateReportSchema,
  CFPC_DENOMINATOR,
  GtmStageLabelSchema,
} from '@nous/shared';

const THRESHOLD_BANDS: Record<string, GtmThresholdBand> = {
  'Closed Cohort': { cfpc_min: 0.4, abpr_min: 0.6 },
  'Open Beta': { cfpc_min: 0.65, abpr_min: 0.75 },
  GA: { cfpc_min: 0.85, abpr_min: 0.85 },
};

export class GtmGateCalculator {
  async computeGateReport(input: GtmGateReportInput): Promise<GtmGateReport> {
    const workingPillars = input.pillar_status.filter(
      (p) => p.working_in_production && !p.blocked_by_s0,
    ).length;
    const cfpc = workingPillars / CFPC_DENOMINATOR;
    const abpr =
      input.total_agent_benchmark_tests > 0
        ? input.passed_agent_benchmark_tests / input.total_agent_benchmark_tests
        : 0;

    const promotionBlocked =
      input.open_s0_count > 0 ||
      cfpc < THRESHOLD_BANDS[input.current_stage]?.cfpc_min ||
      abpr < THRESHOLD_BANDS[input.current_stage]?.abpr_min;

    return GtmGateReportSchema.parse({
      current_stage: input.current_stage,
      cfpc,
      abpr,
      open_s0_count: input.open_s0_count,
      promotion_blocked: promotionBlocked,
      threshold_bands: THRESHOLD_BANDS,
      pillar_status: input.pillar_status,
      generated_at: new Date().toISOString(),
    });
  }

  isPromotionBlocked(
    report: GtmGateReport,
    targetStage: GtmStageLabel,
  ): boolean {
    if (report.open_s0_count > 0) return true;
    const band = THRESHOLD_BANDS[targetStage];
    if (!band) return true;
    return report.cfpc < band.cfpc_min || report.abpr < band.abpr_min;
  }
}
