/**
 * Chat intent schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  ChatIntentClassSchema,
  ChatThreadTypeSchema,
  ChatThreadBindingKindSchema,
  ChatThreadAuthorityModeSchema,
  ChatTurnDecisionSchema,
} from '../../types/chat-intent.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('ChatIntentClassSchema', () => {
  it('accepts all intent classes', () => {
    expect(ChatIntentClassSchema.safeParse('conversational').success).toBe(true);
    expect(ChatIntentClassSchema.safeParse('execution_request').success).toBe(true);
    expect(ChatIntentClassSchema.safeParse('control_intent').success).toBe(true);
    expect(ChatIntentClassSchema.safeParse('project_admin').success).toBe(true);
    expect(ChatIntentClassSchema.safeParse('ambiguous').success).toBe(true);
  });

  it('rejects invalid intent', () => {
    expect(ChatIntentClassSchema.safeParse('invalid').success).toBe(false);
  });
});

describe('ChatThreadTypeSchema', () => {
  it('accepts all thread types', () => {
    expect(ChatThreadTypeSchema.safeParse('project_root').success).toBe(true);
    expect(ChatThreadTypeSchema.safeParse('run_thread').success).toBe(true);
    expect(ChatThreadTypeSchema.safeParse('node_thread').success).toBe(true);
    expect(ChatThreadTypeSchema.safeParse('governance_thread').success).toBe(true);
    expect(ChatThreadTypeSchema.safeParse('scratch_thread').success).toBe(true);
  });
});

describe('ChatThreadBindingKindSchema', () => {
  it('accepts all binding kinds', () => {
    expect(ChatThreadBindingKindSchema.safeParse('scratch').success).toBe(true);
    expect(ChatThreadBindingKindSchema.safeParse('task_run').success).toBe(true);
    expect(ChatThreadBindingKindSchema.safeParse('node_scope').success).toBe(true);
  });
});

describe('ChatThreadAuthorityModeSchema', () => {
  it('accepts all authority modes', () => {
    expect(ChatThreadAuthorityModeSchema.safeParse('authoritative').success).toBe(true);
    expect(ChatThreadAuthorityModeSchema.safeParse('advisory_only').success).toBe(true);
    expect(ChatThreadAuthorityModeSchema.safeParse('non_executable').success).toBe(true);
  });
});

describe('ChatTurnDecisionSchema', () => {
  it('parses valid decision with evidence_ref', () => {
    const result = ChatTurnDecisionSchema.safeParse({
      turn_id: UUID,
      intent_class: 'control_intent',
      decision: 'control_command',
      decision_reason: 'routed to opctl',
      policy_ref: null,
      command_ref: null,
      lease_ref: null,
      evidence_ref: 'ev-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing evidence_ref', () => {
    const result = ChatTurnDecisionSchema.safeParse({
      turn_id: UUID,
      intent_class: 'conversational',
      decision: 'respond',
      decision_reason: 'ok',
      policy_ref: null,
      command_ref: null,
      lease_ref: null,
      evidence_ref: '',
    });
    expect(result.success).toBe(false);
  });
});
