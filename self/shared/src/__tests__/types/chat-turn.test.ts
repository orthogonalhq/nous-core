/**
 * Chat turn envelope schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  ChatActorTypeSchema,
  ChatTurnEnvelopeSchema,
} from '../../types/chat-turn.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('ChatActorTypeSchema', () => {
  it('accepts all actor types', () => {
    expect(ChatActorTypeSchema.safeParse('principal').success).toBe(true);
    expect(ChatActorTypeSchema.safeParse('nous_cortex').success).toBe(true);
    expect(ChatActorTypeSchema.safeParse('orchestration_agent').success).toBe(true);
    expect(ChatActorTypeSchema.safeParse('worker_agent').success).toBe(true);
    expect(ChatActorTypeSchema.safeParse('system').success).toBe(true);
  });
});

describe('ChatTurnEnvelopeSchema', () => {
  it('parses valid envelope with project_id', () => {
    const result = ChatTurnEnvelopeSchema.safeParse({
      turn_id: UUID,
      actor_type: 'principal',
      actor_id: 'user-1',
      actor_session_id: 'sess-1',
      project_id: UUID,
      run_id: null,
      message_ref: 'msg-1',
      received_at: NOW,
      trace_parent: null,
    });
    expect(result.success).toBe(true);
  });

  it('parses valid envelope with null project_id', () => {
    const result = ChatTurnEnvelopeSchema.safeParse({
      turn_id: UUID,
      actor_type: 'principal',
      actor_id: 'user-1',
      actor_session_id: 'sess-1',
      project_id: null,
      run_id: null,
      message_ref: 'msg-1',
      received_at: NOW,
      trace_parent: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid turn_id', () => {
    const result = ChatTurnEnvelopeSchema.safeParse({
      turn_id: 'not-uuid',
      actor_type: 'principal',
      actor_id: 'user-1',
      actor_session_id: 'sess-1',
      project_id: null,
      run_id: null,
      message_ref: 'msg-1',
      received_at: NOW,
      trace_parent: null,
    });
    expect(result.success).toBe(false);
  });
});
