/**
 * Chat card schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  ChatCardTypeSchema,
  ChatThreadBindCommandSchema,
} from '../../types/chat-card.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('ChatCardTypeSchema', () => {
  it('accepts agent_advisory_update', () => {
    expect(ChatCardTypeSchema.safeParse('agent_advisory_update').success).toBe(true);
  });

  it('accepts control_request and control_decision', () => {
    expect(ChatCardTypeSchema.safeParse('control_request').success).toBe(true);
    expect(ChatCardTypeSchema.safeParse('control_decision').success).toBe(true);
  });
});

describe('ChatThreadBindCommandSchema', () => {
  it('parses valid bind from scratch to task_run', () => {
    const result = ChatThreadBindCommandSchema.safeParse({
      command_id: UUID,
      thread_id: UUID,
      from_binding_kind: 'scratch',
      to_binding_kind: 'task_run',
      to_binding_ref: 'run-123',
      actor_id: 'principal',
      reason: 'Bind to active run',
      requested_at: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = ChatThreadBindCommandSchema.safeParse({
      command_id: UUID,
      thread_id: UUID,
      from_binding_kind: 'scratch',
      to_binding_kind: 'task_run',
      to_binding_ref: 'run-123',
      actor_id: 'principal',
      reason: '',
      requested_at: NOW,
    });
    expect(result.success).toBe(false);
  });
});
