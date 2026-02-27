/**
 * Chat scope resolution schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  ScopeResolutionResultSchema,
  ChatEventTypeSchema,
} from '../../types/chat-scope.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('ScopeResolutionResultSchema', () => {
  it('parses resolved result', () => {
    const result = ScopeResolutionResultSchema.safeParse({
      resolved: true,
      project_id: UUID,
      run_id: UUID,
    });
    expect(result.success).toBe(true);
  });

  it('parses resolved with null run_id', () => {
    const result = ScopeResolutionResultSchema.safeParse({
      resolved: true,
      project_id: UUID,
      run_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('parses failed result with PCP-002', () => {
    const result = ScopeResolutionResultSchema.safeParse({
      resolved: false,
      reasonCode: 'PCP-002',
      evidenceRefs: ['project_id required'],
    });
    expect(result.success).toBe(true);
  });

  it('parses failed result with PCP-007', () => {
    const result = ScopeResolutionResultSchema.safeParse({
      resolved: false,
      reasonCode: 'PCP-007',
      evidenceRefs: ['control_state=hard_stopped blocks dispatch'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects failed without evidenceRefs', () => {
    const result = ScopeResolutionResultSchema.safeParse({
      resolved: false,
      reasonCode: 'PCP-002',
      evidenceRefs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatEventTypeSchema', () => {
  it('accepts chat_turn_scope_resolved and chat_turn_scope_resolution_failed', () => {
    expect(ChatEventTypeSchema.safeParse('chat_turn_scope_resolved').success).toBe(true);
    expect(ChatEventTypeSchema.safeParse('chat_turn_scope_resolution_failed').success).toBe(true);
  });

  it('accepts chat_thread_bind_blocked', () => {
    expect(ChatEventTypeSchema.safeParse('chat_thread_bind_blocked').success).toBe(true);
  });
});
