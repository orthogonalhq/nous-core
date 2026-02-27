/**
 * Phase 5.2 PCP invariant violation tests.
 *
 * PCP-002, PCP-007, PCP-008, PCP-009.
 */
import { describe, it, expect } from 'vitest';
import { ChatScopeResolver } from '../../chat/scope-resolver.js';
import { ChatControlRouter } from '../../chat/control-router.js';
import type { ChatTurnEnvelope, ProjectChatThread } from '@nous/shared';
import type { ControlCommandEnvelope } from '@nous/shared';
import type { IOpctlService } from '@nous/shared';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('PCP-002: Executable/control intents must resolve to explicit project scope', () => {
  it('scope resolver returns failed with PCP-002 when project_id null', async () => {
    const resolver = new ChatScopeResolver();
    const envelope: ChatTurnEnvelope = {
      turn_id: UUID,
      actor_type: 'principal',
      actor_id: 'user-1',
      actor_session_id: 'sess-1',
      project_id: null,
      run_id: null,
      message_ref: 'msg-1',
      received_at: NOW,
      trace_parent: null,
    };
    const result = await resolver.resolve(envelope, true);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reasonCode).toBe('PCP-002');
      expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
    }
  });
});

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

describe('PCP-007: Project paused_review|hard_stopped blocks chat-initiated dispatch', () => {
  it('scope resolver returns failed with PCP-007 when hard_stopped', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'hard_stopped',
    } as unknown as IOpctlService;
    const resolver = new ChatScopeResolver(opctl);
    const result = await resolver.resolve(baseEnvelope, true);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reasonCode).toBe('PCP-007');
    }
  });
});

describe('PCP-008: scratch_thread must be non_executable until explicit bind', () => {
  it('control router blocks from scratch thread', async () => {
    const router = new ChatControlRouter();
    const thread: ProjectChatThread = {
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
    };
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      {} as ControlCommandEnvelope,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-008');
  });
});

describe('PCP-009: Executable/control actions must originate from bound non-scratch thread', () => {
  it('control router blocks when thread not bound', async () => {
    const router = new ChatControlRouter();
    const thread: ProjectChatThread = {
      thread_id: UUID,
      project_id: UUID,
      thread_type: 'run_thread',
      binding_kind: 'task_run',
      binding_ref: null,
      parent_thread_id: null,
      promotion_source_ref: null,
      authority_mode: 'authoritative',
      risk_state: 'normal',
      status: 'open',
      created_by: 'principal',
      created_at: NOW,
    };
    const result = await router.routeControlIntent(
      baseEnvelope,
      thread,
      {} as ControlCommandEnvelope,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PCP-009');
  });
});
