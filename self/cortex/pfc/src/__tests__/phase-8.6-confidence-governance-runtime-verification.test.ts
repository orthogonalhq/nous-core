import { describe, expect, it } from 'vitest';
import { ValidationError } from '@nous/shared';
import { evaluateConfidenceGovernanceRuntime } from '../confidence-governance-runtime.js';
import {
  createEscalationSignal,
  createEvaluationInput,
} from './fixtures/confidence-governance-scenarios.js';

describe('Phase 8.6 confidence-governance runtime verification', () => {
  it('produces deterministic stable MAY/SHOULD/MUST outcomes across the canonical matrix', () => {
    const cases = [
      {
        governance: 'may' as const,
        tier: 'high' as const,
        confidence: 0.95,
        supportingSignals: 20,
        expectedOutcome: 'allow_autonomy',
        expectedReason: 'CGR-ALLOW-AUTONOMY',
      },
      {
        governance: 'may' as const,
        tier: 'medium' as const,
        confidence: 0.78,
        supportingSignals: 8,
        expectedOutcome: 'allow_with_flag',
        expectedReason: 'CGR-ALLOW-WITH-FLAG',
      },
      {
        governance: 'should' as const,
        tier: 'high' as const,
        confidence: 0.95,
        supportingSignals: 20,
        expectedOutcome: 'allow_with_flag',
        expectedReason: 'CGR-ALLOW-WITH-FLAG',
      },
      {
        governance: 'should' as const,
        tier: 'medium' as const,
        confidence: 0.78,
        supportingSignals: 8,
        expectedOutcome: 'allow_with_flag',
        expectedReason: 'CGR-ALLOW-WITH-FLAG',
      },
      {
        governance: 'must' as const,
        tier: 'high' as const,
        confidence: 0.95,
        supportingSignals: 20,
        expectedOutcome: 'deny',
        expectedReason: 'CGR-DENY-GOVERNANCE-CEILING',
      },
      {
        governance: 'must' as const,
        tier: 'medium' as const,
        confidence: 0.78,
        supportingSignals: 8,
        expectedOutcome: 'deny',
        expectedReason: 'CGR-DENY-GOVERNANCE-CEILING',
      },
    ];

    for (const testCase of cases) {
      const result = evaluateConfidenceGovernanceRuntime(
        createEvaluationInput({
          governance: testCase.governance,
          confidenceSignal: {
            tier: testCase.tier,
            confidence: testCase.confidence,
            supportingSignals: testCase.supportingSignals,
            decayState: 'stable',
          },
        }),
      );

      expect(result.outcome).toBe(testCase.expectedOutcome);
      expect(result.reasonCode).toBe(testCase.expectedReason);
    }
  });

  it('returns the same result for equivalent repeated inputs', () => {
    const input = createEvaluationInput({
      confidenceSignal: {
        tier: 'medium',
        confidence: 0.76,
        supportingSignals: 10,
        decayState: 'stable',
      },
    });

    const first = evaluateConfidenceGovernanceRuntime(input);
    const second = evaluateConfidenceGovernanceRuntime(input);

    expect(second).toEqual(first);
  });

  it('never returns allow_autonomy for any high-risk action category', () => {
    for (const actionCategory of [
      'tool-execute',
      'memory-write',
      'opctl-command',
    ] as const) {
      const result = evaluateConfidenceGovernanceRuntime(
        createEvaluationInput({
          actionCategory,
          governance: 'may',
          confidenceSignal: {
            tier: 'high',
            confidence: 0.99,
            supportingSignals: 30,
            decayState: 'stable',
          },
        }),
      );

      expect(result.outcome).toBe('defer');
      expect(result.reasonCode).toBe('CGR-DEFER-HIGH-RISK-CONFIRMATION');
    }
  });

  it('fails closed when decay state is absent and no escalation context is available', () => {
    const result = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'high',
          confidence: 0.91,
          supportingSignals: 17,
          decayState: undefined,
        },
        escalationSignal: null,
      }),
    );

    expect(result.outcome).toBe('deny');
    expect(result.reasonCode).toBe('CGR-DENY-MISSING-ESCALATION-CONTEXT');
  });

  it('throws ValidationError when the canonical pattern/explanation alignment is broken', () => {
    expect(() =>
      evaluateConfidenceGovernanceRuntime(
        createEvaluationInput({
          explanation: {
            patternId: '550e8400-e29b-41d4-a716-446655440199' as never,
          },
        }),
      ),
    ).toThrow(ValidationError);
  });

  it('preserves authoritative escalation context for contradiction and retirement states', () => {
    const contradiction = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'low',
          confidence: 0.42,
          supportingSignals: 3,
          decayState: 'decaying',
        },
        escalationSignal: createEscalationSignal('CONF-CONTRADICTION'),
      }),
    );
    const retirement = evaluateConfidenceGovernanceRuntime(
      createEvaluationInput({
        confidenceSignal: {
          tier: 'medium',
          confidence: 0.61,
          supportingSignals: 6,
          decayState: 'flagged_retirement',
        },
        escalationSignal: createEscalationSignal('CONF-RETIREMENT'),
      }),
    );

    expect(contradiction.reasonCode).toBe('CGR-ESCALATE-CONTRADICTION');
    expect(contradiction.escalationSignal?.reasonCode).toBe(
      'CONF-CONTRADICTION',
    );
    expect(retirement.reasonCode).toBe('CGR-ESCALATE-RETIREMENT');
    expect(retirement.escalationSignal?.reasonCode).toBe('CONF-RETIREMENT');
  });
});
