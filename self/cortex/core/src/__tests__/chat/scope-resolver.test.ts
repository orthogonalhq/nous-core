/**
 * Chat scope resolver behavior tests.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 */
import { describe, it, expect } from 'vitest';
import { ChatScopeResolver } from '../../chat/scope-resolver.js';
import type { ChatTurnEnvelope } from '@nous/shared';
import type { IOpctlService } from '@nous/shared';

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

describe('ChatScopeResolver', () => {
  it('returns failed (PCP-002) when project_id is null and requiresExecutableScope', async () => {
    const resolver = new ChatScopeResolver();
    const result = await resolver.resolve(
      { ...baseEnvelope, project_id: null },
      true,
    );
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reasonCode).toBe('PCP-002');
      expect(result.evidenceRefs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns resolved when project_id present and requiresExecutableScope false', async () => {
    const resolver = new ChatScopeResolver();
    const result = await resolver.resolve(baseEnvelope, false);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.project_id).toBe(UUID);
    }
  });

  it('returns failed (PCP-007) when opctl unavailable and requiresExecutableScope', async () => {
    const resolver = new ChatScopeResolver(undefined);
    const result = await resolver.resolve(baseEnvelope, true);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reasonCode).toBe('PCP-007');
    }
  });

  it('returns failed (PCP-007) when control state is hard_stopped', async () => {
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

  it('returns failed (PCP-007) when control state is paused_review', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'paused_review',
    } as unknown as IOpctlService;
    const resolver = new ChatScopeResolver(opctl);
    const result = await resolver.resolve(baseEnvelope, true);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reasonCode).toBe('PCP-007');
    }
  });

  it('returns resolved when control state is running', async () => {
    const opctl: IOpctlService = {
      getProjectControlState: async () => 'running',
    } as unknown as IOpctlService;
    const resolver = new ChatScopeResolver(opctl);
    const result = await resolver.resolve(baseEnvelope, true);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.project_id).toBe(UUID);
    }
  });
});
