import { describe, expect, it } from 'vitest';
import { evaluateConfidenceGovernanceRuntime } from '../confidence-governance-runtime.js';
import {
  PRIMARY_EVIDENCE_REF,
  SECONDARY_EVIDENCE_REF,
  createEscalationSignal,
  createEvaluationInput,
} from './fixtures/confidence-governance-scenarios.js';

describe('evaluateConfidenceGovernanceRuntime', () => {
  it('denies immediately when the project is hard_stopped', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        projectControlState: 'hard_stopped',
        actionCategory: 'tool-execute',
        confidenceSignal: {
          tier: 'low',
          confidence: 0.3,
          supportingSignals: 1,
          decayState: 'decaying',
        },
        escalationSignal: null,
      }),
    );

    expect(result.outcome).toBe('deny');
    expect(result.reasonCode).toBe('CGR-DENY-HARD-STOPPED');
  });

  it('defers while the project is paused_review', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        projectControlState: 'paused_review',
      }),
    );

    expect(result.outcome).toBe('defer');
    expect(result.reasonCode).toBe('CGR-DEFER-PAUSED-REVIEW');
  });

  it('applies the high-risk override before missing escalation context checks', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        actionCategory: 'tool-execute',
        confidenceSignal: {
          tier: 'low',
          confidence: 0.22,
          supportingSignals: 2,
          decayState: 'decaying',
        },
        escalationSignal: null,
      }),
    );

    expect(result.outcome).toBe('defer');
    expect(result.reasonCode).toBe('CGR-DEFER-HIGH-RISK-CONFIRMATION');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.highRiskOverrideApplied).toBe(true);
  });

  it('denies low-confidence input that lacks escalation context', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'low',
          confidence: 0.4,
          supportingSignals: 3,
          decayState: 'stable',
        },
        escalationSignal: null,
      }),
    );

    expect(result.outcome).toBe('deny');
    expect(result.reasonCode).toBe('CGR-DENY-MISSING-ESCALATION-CONTEXT');
  });

  it('escalates low-confidence input when authoritative escalation context is present', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'low',
          confidence: 0.41,
          supportingSignals: 2,
          decayState: 'stable',
        },
        escalationSignal: createEscalationSignal('CONF-LOW'),
      }),
    );

    expect(result.outcome).toBe('escalate');
    expect(result.reasonCode).toBe('CGR-ESCALATE-LOW-CONFIDENCE');
    expect(result.escalationSignal?.reasonCode).toBe('CONF-LOW');
    expect(result.evidenceRefs).toEqual(
      expect.arrayContaining([PRIMARY_EVIDENCE_REF, SECONDARY_EVIDENCE_REF]),
    );
  });

  it('escalates decaying signals with the matching authoritative reason code', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'medium',
          confidence: 0.74,
          supportingSignals: 9,
          decayState: 'decaying',
        },
        escalationSignal: createEscalationSignal('CONF-STALENESS'),
      }),
    );

    expect(result.outcome).toBe('escalate');
    expect(result.reasonCode).toBe('CGR-ESCALATE-STALENESS');
  });

  it('allows autonomy only for stable may/high inputs', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        governance: 'may',
        confidenceSignal: {
          tier: 'high',
          confidence: 0.94,
          supportingSignals: 18,
          decayState: 'stable',
        },
      }),
    );

    expect(result.outcome).toBe('allow_autonomy');
    expect(result.reasonCode).toBe('CGR-ALLOW-AUTONOMY');
    expect(result.autonomyAllowed).toBe(true);
  });

  it('returns allow_with_flag for stable may/medium and should/high paths', () => {
    const mayMedium = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        governance: 'may',
        confidenceSignal: {
          tier: 'medium',
          confidence: 0.75,
          supportingSignals: 9,
          decayState: 'stable',
        },
      }),
    );
    const shouldHigh = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        governance: 'should',
        confidenceSignal: {
          tier: 'high',
          confidence: 0.95,
          supportingSignals: 21,
          decayState: 'stable',
        },
      }),
    );

    expect(mayMedium.outcome).toBe('allow_with_flag');
    expect(mayMedium.reasonCode).toBe('CGR-ALLOW-WITH-FLAG');
    expect(shouldHigh.outcome).toBe('allow_with_flag');
    expect(shouldHigh.reasonCode).toBe('CGR-ALLOW-WITH-FLAG');
  });

  it('denies stable must/high input at the governance ceiling', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        governance: 'must',
        confidenceSignal: {
          tier: 'high',
          confidence: 0.97,
          supportingSignals: 25,
          decayState: 'stable',
        },
      }),
    );

    expect(result.outcome).toBe('deny');
    expect(result.reasonCode).toBe('CGR-DENY-GOVERNANCE-CEILING');
  });
});
