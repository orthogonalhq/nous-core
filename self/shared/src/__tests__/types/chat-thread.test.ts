/**
 * Chat thread schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  ProjectChatThreadSchema,
  ChatThreadRiskStateSchema,
} from '../../types/chat-thread.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('ProjectChatThreadSchema', () => {
  it('parses valid scratch thread with non_executable', () => {
    const result = ProjectChatThreadSchema.safeParse({
      thread_id: UUID,
      project_id: UUID,
      thread_type: 'scratch_thread',
      binding_kind: 'scratch',
      binding_ref: null,
      parent_thread_id: null,
      promotion_source_ref: null,
      authority_mode: 'non_executable',
      risk_state: 'normal',
      status: 'open',
      created_by: 'principal',
      created_at: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('parses valid run thread with binding', () => {
    const result = ProjectChatThreadSchema.safeParse({
      thread_id: UUID,
      project_id: UUID,
      thread_type: 'run_thread',
      binding_kind: 'task_run',
      binding_ref: 'run-123',
      parent_thread_id: UUID,
      promotion_source_ref: null,
      authority_mode: 'authoritative',
      risk_state: 'normal',
      status: 'open',
      created_by: 'principal',
      created_at: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('ChatThreadRiskStateSchema', () => {
  it('accepts normal, elevated, urgent', () => {
    expect(ChatThreadRiskStateSchema.safeParse('normal').success).toBe(true);
    expect(ChatThreadRiskStateSchema.safeParse('elevated').success).toBe(true);
    expect(ChatThreadRiskStateSchema.safeParse('urgent').success).toBe(true);
  });
});
