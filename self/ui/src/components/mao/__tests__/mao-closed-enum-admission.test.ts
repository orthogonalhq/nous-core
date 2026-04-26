// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  GuardrailStatusSchema,
  MaoDensityModeSchema,
  MaoEventTypeSchema,
  WitnessIntegrityStatusSchema,
} from '@nous/shared';
import {
  GUARDRAIL_SEVERITY,
  REDACTION_VISUAL,
  resolveSentinelBand,
  SENTINEL_RISK_BANDS,
  SEVERITY_TOKEN_TO_CSS_VAR,
  WITNESS_INTEGRITY_SEVERITY,
} from '../mao-inspect-panel';

/**
 * UT-SP13-CAT-* + UT-SP13-SENTINEL-BANDS — D1-style closed-enum admission
 * regression guards.
 *
 * Per SDS § Invariants SUPV-SP13-031 + § D1-style admission table; Goals
 * SC-23 + SC-35. Mirrors SP 8 / SP 9 / SP 10 / SP 11 / SP 12 UT-SP*-CAT*
 * happy-path discipline. Every literal SP 13 routes through closed-enum
 * surfaces is admitted here as a runtime regression guard — a future
 * upstream contract narrowing surfaces here as a test failure rather than a
 * runtime/typecheck-time surprise.
 */
describe('SP 13 closed-enum admission regression guards', () => {
  it('UT-SP13-CAT-DENSITY — MaoDensityModeSchema admits all five literals', () => {
    expect(MaoDensityModeSchema.safeParse('D0').success).toBe(true);
    expect(MaoDensityModeSchema.safeParse('D1').success).toBe(true);
    expect(MaoDensityModeSchema.safeParse('D2').success).toBe(true);
    expect(MaoDensityModeSchema.safeParse('D3').success).toBe(true);
    expect(MaoDensityModeSchema.safeParse('D4').success).toBe(true);
    // Negative — unknown literal rejected.
    expect(MaoDensityModeSchema.safeParse('D5').success).toBe(false);
  });

  it('UT-SP13-CAT-GUARDRAIL — GuardrailStatusSchema admits all four literals', () => {
    expect(GuardrailStatusSchema.safeParse('clear').success).toBe(true);
    expect(GuardrailStatusSchema.safeParse('warning').success).toBe(true);
    expect(GuardrailStatusSchema.safeParse('violation').success).toBe(true);
    expect(GuardrailStatusSchema.safeParse('enforced').success).toBe(true);
    expect(GuardrailStatusSchema.safeParse('unknown').success).toBe(false);
    // Closed `Record<>` exhaustiveness sanity-check.
    expect(GUARDRAIL_SEVERITY.clear).toBe('low');
    expect(GUARDRAIL_SEVERITY.warning).toBe('medium');
    expect(GUARDRAIL_SEVERITY.violation).toBe('high');
    expect(GUARDRAIL_SEVERITY.enforced).toBe('critical');
  });

  it('UT-SP13-CAT-WITNESS — WitnessIntegrityStatusSchema admits all three literals', () => {
    expect(WitnessIntegrityStatusSchema.safeParse('intact').success).toBe(true);
    expect(WitnessIntegrityStatusSchema.safeParse('degraded').success).toBe(true);
    expect(WitnessIntegrityStatusSchema.safeParse('broken').success).toBe(true);
    expect(WitnessIntegrityStatusSchema.safeParse('shattered').success).toBe(false);
    // Closed `Record<>` exhaustiveness sanity-check.
    expect(WITNESS_INTEGRITY_SEVERITY.intact).toBe('low');
    expect(WITNESS_INTEGRITY_SEVERITY.degraded).toBe('medium');
    expect(WITNESS_INTEGRITY_SEVERITY.broken).toBe('high');
  });

  it('UT-SP13-CAT-SEVERITY — SeverityToken closed union maps to four design-token CSS variables', () => {
    expect(SEVERITY_TOKEN_TO_CSS_VAR.low).toBe('var(--nous-alert-success)');
    expect(SEVERITY_TOKEN_TO_CSS_VAR.medium).toBe('var(--nous-alert-warning)');
    expect(SEVERITY_TOKEN_TO_CSS_VAR.high).toBe('var(--nous-alert-error)');
    expect(SEVERITY_TOKEN_TO_CSS_VAR.critical).toBe('var(--nous-alert-critical)');
    // Object key set is closed at four entries.
    expect(Object.keys(SEVERITY_TOKEN_TO_CSS_VAR).sort()).toEqual([
      'critical',
      'high',
      'low',
      'medium',
    ]);
  });

  it('UT-SP13-CAT-REDACTION — ReasoningLogRedactionState admits the three SP 1 literals via Record<> exhaustiveness', () => {
    expect(REDACTION_VISUAL.none.badgeText).toBe('Full reasoning');
    expect(REDACTION_VISUAL.none.badgeStyle).toBe('low');
    expect(REDACTION_VISUAL.partial.badgeText).toBe('Partially redacted');
    expect(REDACTION_VISUAL.partial.badgeStyle).toBe('medium');
    expect(REDACTION_VISUAL.restricted.badgeText).toBe('Reasoning restricted');
    expect(REDACTION_VISUAL.restricted.badgeStyle).toBe('high');
    // Object key set is closed at three entries.
    expect(Object.keys(REDACTION_VISUAL).sort()).toEqual([
      'none',
      'partial',
      'restricted',
    ]);
  });

  it('UT-SP13-CAT-MAO-EVENT-TYPES — MaoEventTypeSchema admits the V1 MAO event-type literals (DNR-I1 non-suppression)', () => {
    // Per SDS § DNR Walk-through DNR-A2 / DNR-I1: the V1 MAO event-channel
    // literals must remain admitted; SP 13 polish does not emit these but
    // re-asserts admission here as a regression guard.
    const required = [
      'mao_agent_state_projected',
      'mao_density_mode_changed',
      'mao_urgent_overlay_applied',
      'mao_urgent_overlay_cleared',
      'mao_project_control_requested',
      'mao_project_control_applied',
      'mao_project_control_blocked',
      'mao_pfc_project_recommendation_updated',
      'mao_project_resume_readiness_passed',
      'mao_project_resume_readiness_blocked',
      'mao_graph_lineage_rendered',
    ] as const;
    for (const literal of required) {
      expect(MaoEventTypeSchema.safeParse(literal).success).toBe(true);
    }
    // Negative — non-MAO suppressed event type rejected.
    expect(MaoEventTypeSchema.safeParse('mao_phantom_emission').success).toBe(false);
  });

  it('UT-SP13-SENTINEL-BANDS — boundary-value tests on the closed band-table', () => {
    // SDS SUPV-SP13-019 boundary semantics:
    // [0, 0.25) → low; [0.25, 0.5) → medium; [0.5, 0.75) → high; [0.75, 1.0] → critical.
    expect(resolveSentinelBand(0.0)).toBe('low');
    expect(resolveSentinelBand(0.249)).toBe('low');
    expect(resolveSentinelBand(0.25)).toBe('medium');
    expect(resolveSentinelBand(0.499)).toBe('medium');
    expect(resolveSentinelBand(0.5)).toBe('high');
    expect(resolveSentinelBand(0.749)).toBe('high');
    expect(resolveSentinelBand(0.75)).toBe('critical');
    expect(resolveSentinelBand(1.0)).toBe('critical');
    // Closed band-table cardinality.
    expect(SENTINEL_RISK_BANDS).toHaveLength(4);
    expect(SENTINEL_RISK_BANDS.map((b) => b.upper)).toEqual([0.25, 0.5, 0.75, 1.0]);
    expect(SENTINEL_RISK_BANDS.map((b) => b.token)).toEqual([
      'low',
      'medium',
      'high',
      'critical',
    ]);
  });
});
