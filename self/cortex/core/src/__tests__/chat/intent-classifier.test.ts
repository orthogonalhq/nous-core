/**
 * Chat intent classifier behavior tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Phase 5.3 — Ingress-path classification: system actor → execution_request.
 */
import { describe, it, expect } from 'vitest';
import { ChatIntentClassifier } from '../../chat/intent-classifier.js';
import type { ChatTurnEnvelope } from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

function makeEnvelope(
  overrides: Partial<ChatTurnEnvelope>,
): ChatTurnEnvelope {
  return {
    turn_id: UUID,
    actor_type: 'principal',
    actor_id: 'user-1',
    actor_session_id: 'sess-1',
    project_id: UUID,
    run_id: null,
    message_ref: 'msg-1',
    received_at: NOW,
    trace_parent: null,
    ...overrides,
  };
}

describe('ChatIntentClassifier', () => {
  it('returns ambiguous when scope not resolved', async () => {
    const classifier = new ChatIntentClassifier();
    const envelope = makeEnvelope({});
    const result = await classifier.classify(envelope, false);
    expect(result.intent).toBe('ambiguous');
    expect(result.confidence).toBe(0);
  });

  it('returns conversational when scope resolved and actor is principal', async () => {
    const classifier = new ChatIntentClassifier();
    const envelope = makeEnvelope({ actor_type: 'principal' });
    const result = await classifier.classify(envelope, true);
    expect(result.intent).toBe('conversational');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns execution_request when scope resolved and actor is system (ingress path)', async () => {
    const classifier = new ChatIntentClassifier();
    const envelope = makeEnvelope({ actor_type: 'system' });
    const result = await classifier.classify(envelope, true);
    expect(result.intent).toBe('execution_request');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns ambiguous when scope not resolved and actor is system', async () => {
    const classifier = new ChatIntentClassifier();
    const envelope = makeEnvelope({ actor_type: 'system' });
    const result = await classifier.classify(envelope, false);
    expect(result.intent).toBe('ambiguous');
    expect(result.confidence).toBe(0);
  });
});
