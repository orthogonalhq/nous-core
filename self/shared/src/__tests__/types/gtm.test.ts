/**
 * GTM stage threshold schema tests.
 * Phase 2.6 — MAO Projection and GTM Threshold Baseline.
 */
import { describe, it, expect } from 'vitest';
import {
  CFPC_DENOMINATOR,
  GtmStageLabelSchema,
  GtmGateReportSchema,
  GtmGateReportInputSchema,
  GtmPillarStatusSchema,
} from '../../types/gtm.js';

describe('CFPC_DENOMINATOR', () => {
  it('is 17 per ratified V1 exhaustive feature-pillar set', () => {
    expect(CFPC_DENOMINATOR).toBe(17);
  });
});

describe('GtmStageLabelSchema', () => {
  it('accepts valid stage labels', () => {
    expect(GtmStageLabelSchema.parse('Closed Cohort')).toBe('Closed Cohort');
    expect(GtmStageLabelSchema.parse('Open Beta')).toBe('Open Beta');
    expect(GtmStageLabelSchema.parse('GA')).toBe('GA');
  });

  it('rejects invalid stage label', () => {
    expect(() => GtmStageLabelSchema.parse('Build')).toThrow();
  });
});

describe('GtmGateReportInputSchema', () => {
  const valid = {
    verification_report_ref: 'vr-123',
    pillar_status_source: 'config' as const,
    pillar_status: [
      { pillar_index: 1, working_in_production: true, blocked_by_s0: false },
    ],
    canonical_suite_ref: 'suite-v1',
    passed_agent_benchmark_tests: 10,
    total_agent_benchmark_tests: 12,
    current_stage: 'Closed Cohort' as const,
    open_s0_count: 0,
  };

  it('parses valid GtmGateReportInput', () => {
    const result = GtmGateReportInputSchema.parse(valid);
    expect(result.verification_report_ref).toBe('vr-123');
    expect(result.canonical_suite_ref).toBe('suite-v1');
    expect(result.passed_agent_benchmark_tests).toBe(10);
    expect(result.total_agent_benchmark_tests).toBe(12);
  });

  it('accepts optional benchmark_result_ref', () => {
    const withRef = { ...valid, benchmark_result_ref: 'bench-456' };
    const result = GtmGateReportInputSchema.parse(withRef);
    expect(result.benchmark_result_ref).toBe('bench-456');
  });

  it('rejects pillar_index out of range', () => {
    const badPillar = {
      ...valid,
      pillar_status: [
        { pillar_index: 18, working_in_production: true, blocked_by_s0: false },
      ],
    };
    expect(() => GtmGateReportInputSchema.parse(badPillar)).toThrow();
  });

  it('rejects total_agent_benchmark_tests zero', () => {
    expect(() =>
      GtmGateReportInputSchema.parse({
        ...valid,
        total_agent_benchmark_tests: 0,
      }),
    ).toThrow();
  });
});

describe('GtmGateReportSchema', () => {
  const valid = {
    current_stage: 'Closed Cohort' as const,
    cfpc: 0.5,
    abpr: 0.7,
    open_s0_count: 0,
    promotion_blocked: false,
    threshold_bands: {
      'Closed Cohort': { cfpc_min: 0.4, abpr_min: 0.6 },
      'Open Beta': { cfpc_min: 0.65, abpr_min: 0.75 },
      GA: { cfpc_min: 0.85, abpr_min: 0.85 },
    },
    pillar_status: [
      { pillar_index: 1, working_in_production: true, blocked_by_s0: false },
    ],
    generated_at: '2026-02-24T22:00:00.000Z',
  };

  it('parses valid GtmGateReport', () => {
    const result = GtmGateReportSchema.parse(valid);
    expect(result.cfpc).toBe(0.5);
    expect(result.abpr).toBe(0.7);
    expect(result.promotion_blocked).toBe(false);
  });

  it('rejects cfpc > 1', () => {
    expect(() =>
      GtmGateReportSchema.parse({ ...valid, cfpc: 1.1 }),
    ).toThrow();
  });
});

describe('GtmPillarStatusSchema', () => {
  it('parses valid pillar status', () => {
    const result = GtmPillarStatusSchema.parse({
      pillar_index: 17,
      working_in_production: true,
      blocked_by_s0: false,
    });
    expect(result.pillar_index).toBe(17);
  });

  it('rejects pillar_index < 1', () => {
    expect(() =>
      GtmPillarStatusSchema.parse({
        pillar_index: 0,
        working_in_production: true,
        blocked_by_s0: false,
      }),
    ).toThrow();
  });
});
