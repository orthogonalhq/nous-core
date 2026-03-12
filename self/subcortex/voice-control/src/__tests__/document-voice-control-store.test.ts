import { describe, expect, it } from 'vitest';
import { DocumentVoiceControlStore } from '../document-voice-control-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655449101' as any;
const SESSION_ID = '550e8400-e29b-41d4-a716-446655449102';
const TURN_ID = '550e8400-e29b-41d4-a716-446655449103';

describe('DocumentVoiceControlStore', () => {
  it('persists and lists voice turn, decision, and projection records', async () => {
    const store = new DocumentVoiceControlStore(createMemoryDocumentStore());

    await store.saveTurn({
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      state: 'listening',
      started_at: '2026-03-11T00:00:00.000Z',
      updated_at: '2026-03-11T00:00:00.000Z',
      evidence_refs: ['voice:turn'],
    });
    await store.saveDecision({
      decision_id: '550e8400-e29b-41d4-a716-446655449104',
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      outcome: 'ready_for_canonical_execution',
      intent: null,
      signals: {
        transcript_hash: 'a'.repeat(64),
        handoff_keywords_detected: ['done'],
        semantic_completion_score: 0.9,
        silence_window_ms: 800,
        silence_threshold_ms: 500,
        explicit_handoff_detected: true,
        asr_confidence: 0.92,
        intent_confidence: 0.91,
        handoff_confidence: 0.94,
        observed_at: '2026-03-11T00:00:01.000Z',
      },
      confirmation: {
        required: false,
        dual_channel_required: false,
        text_surface_targets: [],
      },
      degraded_mode_active: false,
      decision_ref: 'voice-decision:test',
      evidence_refs: ['voice:decision'],
      decided_at: '2026-03-11T00:00:01.000Z',
    });
    await store.saveSessionProjection({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      current_turn_state: 'completed',
      assistant_output_state: 'idle',
      degraded_mode: {
        session_id: SESSION_ID,
        project_id: PROJECT_ID,
        active: false,
        evidence_refs: [],
      },
      pending_confirmation: {
        required: false,
        dual_channel_required: false,
        text_surface_targets: [],
      },
      continuation_required: false,
      evidence_refs: ['voice:projection'],
      updated_at: '2026-03-11T00:00:01.000Z',
    });

    const turns = await store.listTurnsByProject(PROJECT_ID);
    const decisions = await store.listDecisionsBySession(SESSION_ID);
    const projection = await store.getSessionProjection(SESSION_ID);

    expect(turns).toHaveLength(1);
    expect(decisions).toHaveLength(1);
    expect(projection?.current_turn_state).toBe('completed');
  });
});
