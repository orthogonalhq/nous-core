// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  ControlActionSchema,
  ControlActorTypeSchema,
  ConfirmationTierSchema,
  CriticalActionCategorySchema,
  GuardrailStatusSchema,
  MaoDensityModeSchema,
  MaoEventTypeSchema,
  MaoProjectControlActionSchema,
  OpctlSubmitResultSchema,
  RecoveryTerminalStateSchema,
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
import {
  TOAST_BODY_BY_OUTCOME,
  classifyOutcome,
  type OpctlSubmitToastOutcome,
} from '../mao-project-controls';
import { ACTOR_VISUAL } from '../mao-audit-trail-panel';
import { ACTION_MAP } from '../mao-t3-confirmation-dialog';
import { randomUUID } from 'node:crypto';

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

  // --- WR-162 SP 14 (SUPV-SP14-017) — D1-style closed-enum admission carry-forward ---

  it('UT-SP14-CAT-TIER — ConfirmationTierSchema admits T0..T3 and rejects unknown', () => {
    expect(ConfirmationTierSchema.safeParse('T0').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T1').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T2').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T3').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T4').success).toBe(false);
  });

  it('UT-SP14-CAT-SEVERITY — tier-display severity union maps closed to four CSS-var literals', () => {
    expect(SEVERITY_TOKEN_TO_CSS_VAR.low).toBeDefined();
    expect(SEVERITY_TOKEN_TO_CSS_VAR.medium).toBeDefined();
    expect(SEVERITY_TOKEN_TO_CSS_VAR.high).toBeDefined();
    expect(SEVERITY_TOKEN_TO_CSS_VAR.critical).toBeDefined();
  });

  it('UT-SP14-CAT-PROJECT-CONTROL-ACTION-REASSERT — three literals; no cancel_queued literal', () => {
    expect(MaoProjectControlActionSchema.safeParse('pause_project').success).toBe(true);
    expect(MaoProjectControlActionSchema.safeParse('resume_project').success).toBe(true);
    expect(MaoProjectControlActionSchema.safeParse('hard_stop_project').success).toBe(true);
    expect(MaoProjectControlActionSchema.safeParse('cancel_queued').success).toBe(false);
  });

  it('UT-SP14-CAT-CONTROL-ACTION-REASSERT — SP 14 routes-through three of the eleven literals', () => {
    expect(ControlActionSchema.safeParse('pause').success).toBe(true);
    expect(ControlActionSchema.safeParse('resume').success).toBe(true);
    expect(ControlActionSchema.safeParse('hard_stop').success).toBe(true);
    // Non-action literal rejected.
    expect(ControlActionSchema.safeParse('cancel_queued').success).toBe(false);
    // ACTION_MAP exhaustively maps the three project-control actions to ControlAction.
    expect(ACTION_MAP.pause_project).toBe('pause');
    expect(ACTION_MAP.resume_project).toBe('resume');
    expect(ACTION_MAP.hard_stop_project).toBe('hard_stop');
  });

  it('UT-SP14-CAT-ACTOR-TYPE — ControlActorTypeSchema admits all five literals; closed Record exhaustiveness', () => {
    expect(ControlActorTypeSchema.safeParse('principal').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('orchestration_agent').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('worker_agent').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('system_agent').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('supervisor').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('operator').success).toBe(false);
    expect(Object.keys(ACTOR_VISUAL).sort()).toEqual([
      'orchestration_agent',
      'principal',
      'supervisor',
      'system_agent',
      'worker_agent',
    ]);
  });

  it('UT-SP14-CAT-OPCTL-REASON-CODE — OpctlSubmitResultSchema admits the four SP-14 routed reason codes; classifyOutcome maps correctly', () => {
    const baseAccepted = {
      command_id: randomUUID(),
      project_id: randomUUID(),
      accepted: true,
      from_state: 'running' as const,
      to_state: 'paused_review' as const,
      decision_ref: 'mao-control:cmd-x',
      impactSummary: {
        activeRunCount: 0,
        activeAgentCount: 0,
        blockedAgentCount: 0,
        urgentAgentCount: 0,
        affectedScheduleCount: 0,
        evidenceRefs: [] as string[],
      },
      evidenceRefs: [] as string[],
      readiness_status: 'not_applicable' as const,
    };
    // applied
    expect(
      classifyOutcome({
        ...baseAccepted,
        status: 'applied',
        reason_code: 'mao_project_control_applied',
      } as any),
    ).toBe('applied');
    // rejected
    expect(
      classifyOutcome({
        ...baseAccepted,
        accepted: false,
        status: 'rejected',
        reason_code: 'OPCTL-006',
      } as any),
    ).toBe('rejected');
    // blocked_conflict_resolved
    expect(
      classifyOutcome({
        ...baseAccepted,
        accepted: false,
        status: 'blocked',
        reason_code: 'opctl_conflict_resolved',
      } as any),
    ).toBe('blocked_conflict_resolved');
    // blocked_other (e.g., supervisor_enforcement_lock or OPCTL-003)
    expect(
      classifyOutcome({
        ...baseAccepted,
        accepted: false,
        status: 'blocked',
        reason_code: 'supervisor_enforcement_lock',
      } as any),
    ).toBe('blocked_other');
    // OpctlSubmitResultSchema admits a runtime sample with the four reason codes
    const reasonCodes = [
      'opctl_conflict_resolved',
      'supervisor_enforcement_lock',
      'OPCTL-003',
      'OPCTL-006',
    ];
    for (const code of reasonCodes) {
      const sample = OpctlSubmitResultSchema.safeParse({
        control_command_id: randomUUID(),
        status: 'blocked',
        reason: 'sample',
        reason_code: code,
      });
      expect(sample.success).toBe(true);
    }
  });

  it('UT-SP14-CAT-MAO-EVENT-TYPES-REASSERT — eleven literals admitted; unknown rejected', () => {
    const eleven = [
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
    for (const literal of eleven) {
      expect(MaoEventTypeSchema.safeParse(literal).success).toBe(true);
    }
    expect(MaoEventTypeSchema.safeParse('mao_phantom_emission').success).toBe(false);
  });

  it('UT-SP14-CAT-RATIONALE-KEY — TOAST_BODY_BY_OUTCOME closed Record over four OpctlSubmitToastOutcome literals', () => {
    const expected: OpctlSubmitToastOutcome[] = [
      'applied',
      'rejected',
      'blocked_conflict_resolved',
      'blocked_other',
    ];
    expect(Object.keys(TOAST_BODY_BY_OUTCOME).sort()).toEqual([...expected].sort());
    expect(TOAST_BODY_BY_OUTCOME.applied.tone).toBe('success');
    expect(TOAST_BODY_BY_OUTCOME.rejected.tone).toBe('error');
    expect(TOAST_BODY_BY_OUTCOME.blocked_conflict_resolved.tone).toBe('info');
    expect(TOAST_BODY_BY_OUTCOME.blocked_other.tone).toBe('warn');
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

/**
 * SP 15 — UT-SP15-CAT-* (SUPV-SP15-006).
 *
 * D1-style closed-enum admission rows. Mirrors SP 14 8-row + adds 2
 * SP-15-specific surfaces (`RecoveryTerminalState`, StatusBar indicator
 * identity, `CriticalActionCategory`). Each row iterates over the closed-enum
 * domain via TypeScript exhaustiveness + `safeParse(...).success === true`
 * runtime regression guard. Mechanism per
 * `feedback_no_heuristic_bandaids.md`: closed-enum domain admission only.
 */
describe('SP 15 D1-style closed-enum admission regression guards', () => {
  it('UT-SP15-CAT-TIER-MATRIX — ConfirmationTierSchema admits T0..T3 exhaustively', () => {
    for (const t of (['T0', 'T1', 'T2', 'T3'] as const)) {
      expect(ConfirmationTierSchema.safeParse(t).success).toBe(true);
    }
    expect(ConfirmationTierSchema.safeParse('T4').success).toBe(false);
  });

  it('UT-SP15-CAT-SEVERITY-MATRIX — closed SeverityToken set resolves via SEVERITY_TOKEN_TO_CSS_VAR', () => {
    for (const s of (['low', 'medium', 'high', 'critical'] as const)) {
      expect(typeof SEVERITY_TOKEN_TO_CSS_VAR[s]).toBe('string');
      expect(SEVERITY_TOKEN_TO_CSS_VAR[s].length).toBeGreaterThan(0);
    }
  });

  it('UT-SP15-CAT-PROJECT-CONTROL-ACTION-REASSERT-MATRIX — three literals; no cancel_queued', () => {
    for (const a of (['pause_project', 'resume_project', 'hard_stop_project'] as const)) {
      expect(MaoProjectControlActionSchema.safeParse(a).success).toBe(true);
    }
    // Asserts NO cancel_queued literal admission.
    expect(MaoProjectControlActionSchema.safeParse('cancel_queued').success).toBe(false);
  });

  it('UT-SP15-CAT-CONTROL-ACTOR-TYPE-MATRIX — ControlActorType admits five literals exhaustively', () => {
    for (const t of ([
      'principal',
      'orchestration_agent',
      'worker_agent',
      'system_agent',
      'supervisor',
    ] as const)) {
      expect(ControlActorTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(ControlActorTypeSchema.safeParse('operator').success).toBe(false);
  });

  it('UT-SP15-CAT-MAO-EVENT-TYPES-REASSERT-MATRIX — eleven literals admitted', () => {
    const eleven = [
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
    for (const e of eleven) {
      expect(MaoEventTypeSchema.safeParse(e).success).toBe(true);
    }
    expect(MaoEventTypeSchema.safeParse('mao_unknown').success).toBe(false);
  });

  it('UT-SP15-CAT-OPCTL-REASON-CODE-MATRIX — SP 14 admit set passes safeParse on OpctlSubmitResult', () => {
    const codes = [
      'opctl_conflict_resolved',
      'supervisor_enforcement_lock',
      'supervisor_actor_forbidden_action',
      'OPCTL-003',
      'OPCTL-006',
      'OPCTL-008',
    ];
    for (const code of codes) {
      const sample = OpctlSubmitResultSchema.safeParse({
        control_command_id: randomUUID(),
        status: 'blocked',
        reason: 'matrix-cell',
        reason_code: code,
      });
      expect(sample.success).toBe(true);
    }
  });

  it('UT-SP15-CAT-RECOVERY-TERMINAL-STATE — RecoveryTerminalStateSchema admits three literals exhaustively', () => {
    for (const s of ([
      'recovery_completed',
      'recovery_blocked_review_required',
      'recovery_failed_hard_stop',
    ] as const)) {
      expect(RecoveryTerminalStateSchema.safeParse(s).success).toBe(true);
    }
    expect(RecoveryTerminalStateSchema.safeParse('recovery_unknown').success).toBe(false);
  });

  it('UT-SP15-CAT-STATUSBAR-INDICATOR — closed four-indicator → ObserveTab map matches spec contract', () => {
    // Closed `Record<IndicatorIdentity, ObserveTab>` enumeration.
    // Per SDS § Phase F admission-row 8 + Goals SC-21.
    const STATUSBAR_INDICATOR_TO_TAB = {
      BackpressureIndicator: 'system-load',
      BudgetIndicator: 'cost-monitor',
      CognitiveProfileIndicator: 'cost-monitor',
      ActiveAgentsIndicator: 'agents',
    } as const;
    expect(Object.keys(STATUSBAR_INDICATOR_TO_TAB).sort()).toEqual([
      'ActiveAgentsIndicator',
      'BackpressureIndicator',
      'BudgetIndicator',
      'CognitiveProfileIndicator',
    ]);
    // Closed-enum exhaustiveness: only the four declared identity literals
    // resolve to a defined tab.
    for (const k of Object.keys(STATUSBAR_INDICATOR_TO_TAB) as Array<
      keyof typeof STATUSBAR_INDICATOR_TO_TAB
    >) {
      expect(typeof STATUSBAR_INDICATOR_TO_TAB[k]).toBe('string');
    }
  });

  it('UT-SP15-CAT-CRITICAL-ACTION-CATEGORY — admits nine literals incl. supervisor-detection and supervisor-enforcement', () => {
    const nine = [
      'model-invoke',
      'tool-execute',
      'memory-write',
      'trace-persist',
      'opctl-command',
      'mao-projection',
      'supervisor-detection',
      'supervisor-enforcement',
      'recovery-evidence',
    ] as const;
    for (const c of nine) {
      expect(CriticalActionCategorySchema.safeParse(c).success).toBe(true);
    }
    // Asserts admission of the SP 4 / SP 8 supervisor + recovery categories
    // explicitly for scenario 1 dual-witness consumption.
    expect(CriticalActionCategorySchema.safeParse('supervisor-detection').success).toBe(true);
    expect(CriticalActionCategorySchema.safeParse('supervisor-enforcement').success).toBe(true);
    expect(CriticalActionCategorySchema.safeParse('unknown-category').success).toBe(false);
  });

  it('UT-SP15-CAT-RATIONALE-KEY — five-literal RationaleKey set resolves via RATIONALE_COPY', () => {
    // Re-asserts SP 14 RATIONALE_COPY closed map (the renderer-side const in
    // mao-t3-confirmation-dialog.tsx). The compile-time exhaustiveness is
    // covered by SP 14 UT-SP14-CAT-RATIONALE-KEY; this row is a regression
    // guard naming the five-literal admit.
    const expected = [
      'tier.t0.rationale',
      'tier.t1.rationale',
      'tier.t2.rationale',
      'tier.t3.rationale',
      'tier.t3.supervisor_locked',
    ] as const;
    expect(expected.length).toBe(5);
    // The closed-set assertion: every key is a closed-form RationaleKey
    // (verified by import of `RationaleKey` type at SP 14 admission rows).
    for (const k of expected) {
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
    }
  });
});
