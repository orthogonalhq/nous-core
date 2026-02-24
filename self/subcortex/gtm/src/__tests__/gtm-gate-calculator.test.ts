/**
 * GtmGateCalculator tests.
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 */
import { describe, it, expect } from 'vitest';
import { GtmGateCalculator } from '../gtm-gate-calculator.js';
import { CFPC_DENOMINATOR } from '@nous/shared';

const calc = new GtmGateCalculator();

const baseInput = {
  verification_report_ref: 'vr-1',
  pillar_status_source: 'config' as const,
  pillar_status: Array.from({ length: 17 }, (_, i) => ({
    pillar_index: i + 1,
    working_in_production: i < 7,
    blocked_by_s0: false,
  })),
  canonical_suite_ref: 'suite-v1',
  passed_agent_benchmark_tests: 8,
  total_agent_benchmark_tests: 10,
  current_stage: 'Closed Cohort' as const,
  open_s0_count: 0,
};

describe('GtmGateCalculator', () => {
  it('CFPC = working_in_production_feature_pillars / 17', async () => {
    const report = await calc.computeGateReport(baseInput);
    expect(report.cfpc).toBeCloseTo(7 / CFPC_DENOMINATOR);
    expect(CFPC_DENOMINATOR).toBe(17);
  });

  it('ABPR = passed_agent_benchmark_tests / total_agent_benchmark_tests', async () => {
    const report = await calc.computeGateReport(baseInput);
    expect(report.abpr).toBe(0.8);
  });

  it('open_s0_count > 0 sets promotion_blocked true (GTM-001)', async () => {
    const report = await calc.computeGateReport({
      ...baseInput,
      open_s0_count: 1,
    });
    expect(report.promotion_blocked).toBe(true);
    expect(calc.isPromotionBlocked(report, 'Open Beta')).toBe(true);
  });

  it('isPromotionBlocked returns true when open S0', async () => {
    const report = await calc.computeGateReport({
      ...baseInput,
      open_s0_count: 1,
    });
    expect(calc.isPromotionBlocked(report, 'GA')).toBe(true);
  });

  it('threshold bands: Closed Cohort 40%/60%, Open Beta 65%/75%, GA 85%/85%', async () => {
    const report = await calc.computeGateReport(baseInput);
    expect(report.threshold_bands['Closed Cohort']).toEqual({
      cfpc_min: 0.4,
      abpr_min: 0.6,
    });
    expect(report.threshold_bands['Open Beta']).toEqual({
      cfpc_min: 0.65,
      abpr_min: 0.75,
    });
    expect(report.threshold_bands['GA']).toEqual({
      cfpc_min: 0.85,
      abpr_min: 0.85,
    });
  });

  it('promotion_blocked when CFPC below threshold', async () => {
    const lowCfpc = {
      ...baseInput,
      pillar_status: Array.from({ length: 17 }, (_, i) => ({
        pillar_index: i + 1,
        working_in_production: i < 2,
        blocked_by_s0: false,
      })),
    };
    const report = await calc.computeGateReport(lowCfpc);
    expect(report.cfpc).toBeLessThan(0.4);
    expect(report.promotion_blocked).toBe(true);
  });
});
