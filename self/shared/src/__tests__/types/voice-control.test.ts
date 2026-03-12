import { describe, expect, it } from 'vitest';
import {
  VoiceAssistantOutputInputSchema,
  VoiceBargeInInputSchema,
  VoiceContinuationInputSchema,
  VoiceSessionProjectionSchema,
  VoiceTurnEvaluationInputSchema,
  VoiceTurnStartInputSchema,
} from '../../types/voice-control.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655448001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655448002';
const TURN_ID = '550e8400-e29b-41d4-a716-446655448003';

describe('VoiceTurnStartInputSchema', () => {
  it('parses canonical voice turn starts', () => {
    const result = VoiceTurnStartInputSchema.safeParse({
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      channel: 'web',
      evidence_refs: ['voice:turn'],
    });

    expect(result.success).toBe(true);
  });
});

describe('VoiceTurnEvaluationInputSchema', () => {
  it('parses canonical voice turn evaluation inputs with confidence and confirmation context', () => {
    const result = VoiceTurnEvaluationInputSchema.safeParse({
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      signals: {
        transcript_hash: 'a'.repeat(64),
        handoff_keywords_detected: ['done'],
        semantic_completion_score: 0.94,
        silence_window_ms: 900,
        silence_threshold_ms: 500,
        explicit_handoff_detected: true,
        asr_confidence: 0.92,
        intent_confidence: 0.9,
        handoff_confidence: 0.88,
        observed_at: '2026-03-11T00:00:00.000Z',
      },
      intents: [
        {
          intent_id: '550e8400-e29b-41d4-a716-446655448004',
          turn_id: TURN_ID,
          project_id: PROJECT_ID,
          intent_class: 'project_control',
          action_category: 'opctl-command',
          risk_level: 'high',
          requested_action_ref: 'project.pause',
          evidence_refs: ['voice:intent'],
        },
      ],
      evidence_refs: ['voice:evaluate'],
    });

    expect(result.success).toBe(true);
  });
});

describe('VoiceAssistantOutputInputSchema and VoiceBargeInInputSchema', () => {
  it('parse assistant output and barge-in inputs for interruption-safe runtime handling', () => {
    const output = VoiceAssistantOutputInputSchema.safeParse({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      output_id: '550e8400-e29b-41d4-a716-446655448005',
      output_hash: 'b'.repeat(64),
      state: 'speaking',
      started_at: '2026-03-11T00:00:00.000Z',
      evidence_refs: ['voice:output'],
    });
    const bargeIn = VoiceBargeInInputSchema.safeParse({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      active_output_id: '550e8400-e29b-41d4-a716-446655448005',
      detected_at: '2026-03-11T00:00:00.000Z',
      stop_completed_at: '2026-03-11T00:00:00.150Z',
      evidence_refs: ['voice:barge'],
    });

    expect(output.success).toBe(true);
    expect(bargeIn.success).toBe(true);
  });
});

describe('VoiceContinuationInputSchema', () => {
  it('parses explicit continuation resolution inputs', () => {
    const result = VoiceContinuationInputSchema.safeParse({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      output_id: '550e8400-e29b-41d4-a716-446655448005',
      resolution: 'switch_to_text',
      evidence_refs: ['voice:continue'],
    });

    expect(result.success).toBe(true);
  });
});

describe('VoiceSessionProjectionSchema', () => {
  it('parses projection-safe voice session state for downstream consumers', () => {
    const result = VoiceSessionProjectionSchema.safeParse({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      current_turn_state: 'awaiting_text_confirmation',
      assistant_output_state: 'awaiting_continuation',
      degraded_mode: {
        session_id: SESSION_ID,
        project_id: PROJECT_ID,
        active: true,
        reason: 'barge_in_recovery_required',
        entered_at: '2026-03-11T00:00:00.150Z',
        evidence_refs: ['voice:degraded'],
      },
      pending_confirmation: {
        required: true,
        confirmation_tier: 'T3',
        dual_channel_required: true,
        text_surface_targets: ['chat', 'projects', 'mao', 'mobile'],
      },
      continuation_required: true,
      evidence_refs: ['voice:projection'],
      updated_at: '2026-03-11T00:00:00.150Z',
    });

    expect(result.success).toBe(true);
  });
});

describe('Voice confirmation targets', () => {
  it('accept mobile as a text confirmation target', () => {
    const result = VoiceSessionProjectionSchema.safeParse({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      current_turn_state: 'awaiting_text_confirmation',
      assistant_output_state: 'idle',
      degraded_mode: {
        session_id: SESSION_ID,
        project_id: PROJECT_ID,
        active: false,
        evidence_refs: [],
      },
      pending_confirmation: {
        required: true,
        dual_channel_required: false,
        text_surface_targets: ['mobile'],
      },
      continuation_required: false,
      evidence_refs: [],
      updated_at: '2026-03-11T00:00:00.150Z',
    });

    expect(result.success).toBe(true);
  });
});
