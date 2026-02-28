/**
 * Chat control router behavior tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import { ChatControlRouter } from '../../chat/control-router.js';
import type { ChatTurnEnvelope, ProjectChatThread } from '@nous/shared';
import type { ControlCommandEnvelope } from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

const baseEnvelope: ChatTurnEnvelope = {
  turn_id: UUID,
  actor_type: 'principal',
  actor_id: 'user-1',
  actor_session_id: 'sess-1',
  project_id: UUID,
  run_id: null,
  message_ref: 'msg-1',
  received_at: NOW,
  trace_parent: null,
};

const stubCommand: ControlCommandEnvelope = {} as ControlCommandEnvelope;

function makeThread(overrides: Partial<ProjectChatThread>): ProjectChatThread {
  return {
    thread_id: UUID,
    project_id: UUID,
    thread_type: 'run_thread',
    binding_kind: 'task_run',
    binding_ref: 'run-123',
    parent_thread_id: null,
    promotion_source_ref: null,
    authority_mode: 'authoritative',
    risk_state: 'normal',
    status: 'open',
    created_by: 'principal',
    created_at: NOW,
    ...overrides,
  };
}

describe('ChatControlRouter', () => {
  it('blocks when thread authority_mode is non_executable (PCP-008)', async () => {
    const router = new ChatControlRouter();
    const thread = makeThread({ authority_mode: 'non_executable' });
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      stubCommand,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-008');
    expect(result.evidenceRefs?.length).toBeGreaterThanOrEqual(1);
  });

  it('blocks when thread binding_kind is scratch (PCP-009)', async () => {
    const router = new ChatControlRouter();
    const thread = makeThread({ binding_kind: 'scratch', binding_ref: null });
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      stubCommand,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-009');
  });

  it('blocks when thread binding_ref is null (PCP-009)', async () => {
    const router = new ChatControlRouter();
    const thread = makeThread({ binding_ref: null });
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      stubCommand,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-009');
  });

  it('allows when thread is bound and authoritative', async () => {
    const router = new ChatControlRouter();
    const thread = makeThread({});
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      stubCommand,
    );
    expect(result.allowed).toBe(true);
  });
});
