/**
 * Chat thread bind guard behavior tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import { ChatThreadBindGuard } from '../../chat/thread-bind-guard.js';
import type { ChatThreadBindCommand, ProjectChatThread } from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

function makeCommand(overrides: Partial<ChatThreadBindCommand>): ChatThreadBindCommand {
  return {
    command_id: UUID,
    thread_id: UUID,
    from_binding_kind: 'scratch',
    to_binding_kind: 'task_run',
    to_binding_ref: 'run-123',
    actor_id: 'principal',
    reason: 'Bind to active run',
    requested_at: NOW,
    ...overrides,
  };
}

function makeThread(overrides: Partial<ProjectChatThread>): ProjectChatThread {
  return {
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
    ...overrides,
  };
}

describe('ChatThreadBindGuard', () => {
  it('blocks when reason is empty (PCP-010)', async () => {
    const guard = new ChatThreadBindGuard();
    const command = makeCommand({ reason: '' });
    const thread = makeThread({});
    const result = await guard.evaluateBind(command, thread);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-010');
  });

  it('allows scratch-to-task_run with explicit reason', async () => {
    const guard = new ChatThreadBindGuard();
    const command = makeCommand({ from_binding_kind: 'scratch' });
    const thread = makeThread({ binding_kind: 'scratch' });
    const result = await guard.evaluateBind(command, thread);
    expect(result.allowed).toBe(true);
  });

  it('blocks when from_binding_kind mismatch for scratch thread', async () => {
    const guard = new ChatThreadBindGuard();
    const command = makeCommand({ from_binding_kind: 'task_run' });
    const thread = makeThread({ binding_kind: 'scratch' });
    const result = await guard.evaluateBind(command, thread);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-008');
  });
});
