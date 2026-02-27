/**
 * Chat node context schema contract tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import {
  NodeContextCardSchema,
  NodeReasoningLogEntrySchema,
  NodeReasoningLogClassSchema,
} from '../../types/chat-node-context.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('NodeContextCardSchema', () => {
  it('parses valid card', () => {
    const result = NodeContextCardSchema.safeParse({
      card_id: UUID,
      project_id: UUID,
      run_id: UUID,
      node_scope_ref: 'node-1',
      parent_thread_id: UUID,
      state: 'running',
      risk_state: 'normal',
      summary: 'Processing',
      evidence_ref: 'ev-001',
      emitted_at: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('NodeReasoningLogEntrySchema', () => {
  it('parses valid entry with class and evidence_ref', () => {
    const result = NodeReasoningLogEntrySchema.safeParse({
      entry_id: UUID,
      project_id: UUID,
      run_id: UUID,
      node_scope_ref: 'node-1',
      class: 'action_step',
      summary: 'Executed tool',
      artifact_refs: [],
      evidence_ref: 'ev-001',
      confidence: 'high',
      risk_state: 'normal',
      redaction_class: 'public_operator',
      emitted_at: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing evidence_ref', () => {
    const result = NodeReasoningLogEntrySchema.safeParse({
      entry_id: UUID,
      project_id: UUID,
      run_id: UUID,
      node_scope_ref: 'node-1',
      class: 'intent_summary',
      summary: 'Summary',
      artifact_refs: [],
      evidence_ref: '',
      confidence: 'medium',
      risk_state: 'normal',
      redaction_class: 'public_operator',
      emitted_at: NOW,
    });
    expect(result.success).toBe(false);
  });
});

describe('NodeReasoningLogClassSchema', () => {
  it('accepts all log classes', () => {
    expect(NodeReasoningLogClassSchema.safeParse('intent_summary').success).toBe(true);
    expect(NodeReasoningLogClassSchema.safeParse('action_step').success).toBe(true);
    expect(NodeReasoningLogClassSchema.safeParse('blocker').success).toBe(true);
    expect(NodeReasoningLogClassSchema.safeParse('next_action').success).toBe(true);
  });
});
