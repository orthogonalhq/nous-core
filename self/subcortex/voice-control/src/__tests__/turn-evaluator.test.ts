import { describe, expect, it } from 'vitest';
import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  IPfcEngine,
  ProjectId,
  VoiceTurnEvaluationInput,
  VoiceTurnStateRecord,
} from '@nous/shared';
import { TurnEvaluator } from '../turn-evaluator.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655449201' as ProjectId;
const SESSION_ID = '550e8400-e29b-41d4-a716-446655449202';
const TURN_ID = '550e8400-e29b-41d4-a716-446655449203';

class FakePfcEngine implements IPfcEngine {
  constructor(private readonly result: ConfidenceGovernanceEvaluationResult) {}
  async evaluateConfidenceGovernance(
    _input: ConfidenceGovernanceEvaluationInput,
  ): Promise<ConfidenceGovernanceEvaluationResult> {
    return this.result;
  }
  async evaluateMemoryWrite(): Promise<any> { throw new Error('unused'); }
  async evaluateMemoryMutation(): Promise<any> { throw new Error('unused'); }
  async evaluateToolExecution(): Promise<any> { throw new Error('unused'); }
  async reflect(): Promise<any> { throw new Error('unused'); }
  async evaluateEscalation(): Promise<any> { throw new Error('unused'); }
  getTier(): any { return 'tier_0'; }
}

function createInput(
  overrides: Partial<VoiceTurnEvaluationInput> = {},
): VoiceTurnEvaluationInput {
  return {
    turn_id: TURN_ID,
    session_id: SESSION_ID,
    project_id: PROJECT_ID,
    principal_id: 'principal',
    signals: {
      transcript_hash: 'a'.repeat(64),
      handoff_keywords_detected: ['done'],
      semantic_completion_score: 0.95,
      silence_window_ms: 1000,
      silence_threshold_ms: 500,
      explicit_handoff_detected: true,
      asr_confidence: 0.95,
      intent_confidence: 0.93,
      handoff_confidence: 0.9,
      observed_at: '2026-03-11T00:00:00.000Z',
    },
    intents: [
      {
        intent_id: '550e8400-e29b-41d4-a716-446655449204',
        turn_id: TURN_ID,
        project_id: PROJECT_ID,
        intent_class: 'project_control',
        action_category: 'opctl-command',
        risk_level: 'high',
        requested_action_ref: 'project.pause',
        evidence_refs: ['intent:evidence'],
      },
    ],
    evidence_refs: ['voice:evaluate'],
    ...overrides,
  };
}

const currentTurn: VoiceTurnStateRecord = {
  turn_id: TURN_ID,
  session_id: SESSION_ID,
  project_id: PROJECT_ID,
  principal_id: 'principal',
  state: 'listening',
  started_at: '2026-03-11T00:00:00.000Z',
  updated_at: '2026-03-11T00:00:00.000Z',
  evidence_refs: [],
};

describe('TurnEvaluator', () => {
  it('requires confirmation for high-risk actions when proof is absent', async () => {
    const evaluator = new TurnEvaluator({
      pfcEngine: new FakePfcEngine({
        outcome: 'defer',
        reasonCode: 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
        governance: 'must',
        actionCategory: 'opctl-command',
        patternId: '550e8400-e29b-41d4-a716-446655449204' as any,
        confidence: 0.93,
        confidenceTier: 'high',
        supportingSignals: 19,
        autonomyAllowed: false,
        requiresConfirmation: true,
        highRiskOverrideApplied: true,
        evidenceRefs: [{ actionCategory: 'trace-persist' }],
        explanation: {
          patternId: '550e8400-e29b-41d4-a716-446655449204' as any,
          outcomeRef: 'voice-turn:test',
          evidenceRefs: [{ actionCategory: 'trace-persist' }],
        },
      }),
      now: () => '2026-03-11T00:00:01.000Z',
      idFactory: () => '550e8400-e29b-41d4-a716-446655449205',
    });

    const result = await evaluator.evaluate(createInput(), currentTurn, null);

    expect(result.decision.outcome).toBe('text_confirmation_required');
    expect(result.decision.confirmation.required).toBe(true);
    expect(result.nextTurnState).toBe('awaiting_text_confirmation');
  });

  it('rejects silence-only turns from becoming execution-ready', async () => {
    const evaluator = new TurnEvaluator({
      now: () => '2026-03-11T00:00:01.000Z',
      idFactory: () => '550e8400-e29b-41d4-a716-446655449206',
    });

    const baseInput = createInput();
    const result = await evaluator.evaluate(
      createInput({
        signals: {
          ...baseInput.signals,
          semantic_completion_score: 0.4,
          explicit_handoff_detected: false,
          handoff_keywords_detected: [],
        },
        intents: [],
      }),
      currentTurn,
      null,
    );

    expect(result.decision.outcome).toBe('continue_listening');
    expect(result.nextTurnState).toBe('listening');
  });

  it('requires dual-channel confirmation for critical destructive actions', async () => {
    const evaluator = new TurnEvaluator({
      now: () => '2026-03-11T00:00:01.000Z',
      idFactory: () => '550e8400-e29b-41d4-a716-446655449207',
    });

    const baseInput = createInput();
    const result = await evaluator.evaluate(
      createInput({
        intents: [
          {
            ...baseInput.intents[0]!,
            risk_level: 'critical',
            requested_action_ref: 'project.hard_stop',
          },
        ],
      }),
      currentTurn,
      null,
    );

    expect(result.decision.outcome).toBe('dual_channel_confirmation_required');
    expect(result.decision.confirmation.dual_channel_required).toBe(true);
  });
});
