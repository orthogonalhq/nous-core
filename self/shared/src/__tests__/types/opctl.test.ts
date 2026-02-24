import { describe, it, expect } from 'vitest';
import {
  ControlCommandEnvelopeSchema,
  ConfirmationProofSchema,
  ConfirmationProofRequestSchema,
  OpctlSubmitResultSchema,
  ScopeSnapshotSchema,
  ControlScopeSchema,
  ControlActionSchema,
  ControlActorTypeSchema,
  ConfirmationTierSchema,
  OpctlEventTypeSchema,
} from '../../types/opctl.js';

const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 60000).toISOString();
const HASH = 'a'.repeat(64);
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('ControlCommandEnvelopeSchema', () => {
  it('parses valid envelope', () => {
    const result = ControlCommandEnvelopeSchema.safeParse({
      control_command_id: UUID,
      actor_type: 'principal',
      actor_id: UUID,
      actor_session_id: UUID,
      actor_seq: 1,
      nonce: UUID,
      issued_at: NOW,
      expires_at: LATER,
      scope: { class: 'project_run_scope', kind: 'project_run', project_id: PROJECT_ID },
      payload_hash: HASH,
      command_signature: 'sig',
      action: 'pause',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid payload_hash', () => {
    const result = ControlCommandEnvelopeSchema.safeParse({
      control_command_id: UUID,
      actor_type: 'principal',
      actor_id: UUID,
      actor_session_id: UUID,
      actor_seq: 1,
      nonce: UUID,
      issued_at: NOW,
      expires_at: LATER,
      scope: { class: 'project_run_scope', kind: 'project_run' },
      payload_hash: 'short',
      command_signature: 'sig',
      action: 'pause',
    });
    expect(result.success).toBe(false);
  });
});

describe('ConfirmationProofSchema', () => {
  it('parses valid proof', () => {
    const result = ConfirmationProofSchema.safeParse({
      proof_id: UUID,
      issued_at: NOW,
      expires_at: LATER,
      scope_hash: HASH,
      action: 'hard_stop',
      tier: 'T3',
      signature: 'sig',
    });
    expect(result.success).toBe(true);
  });
});

describe('ConfirmationProofRequestSchema', () => {
  it('parses valid request', () => {
    const result = ConfirmationProofRequestSchema.safeParse({
      scope: { class: 'project_run_scope', kind: 'project_run', project_id: PROJECT_ID },
      action: 'cancel',
      tier: 'T2',
    });
    expect(result.success).toBe(true);
  });
});

describe('OpctlSubmitResultSchema', () => {
  it('parses applied result', () => {
    const result = OpctlSubmitResultSchema.safeParse({
      status: 'applied',
      control_command_id: UUID,
      target_ids_hash: HASH,
    });
    expect(result.success).toBe(true);
  });

  it('parses blocked result with reason', () => {
    const result = OpctlSubmitResultSchema.safeParse({
      status: 'blocked',
      control_command_id: UUID,
      reason: 'Replay detected',
      reason_code: 'OPCTL-002',
    });
    expect(result.success).toBe(true);
  });
});

describe('ScopeSnapshotSchema', () => {
  it('parses valid snapshot', () => {
    const result = ScopeSnapshotSchema.safeParse({
      scope: { class: 'project_run_scope', kind: 'project_run', project_id: PROJECT_ID },
      target_ids: [UUID],
      target_ids_hash: HASH,
      target_count: 1,
      resolved_at: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('ControlScopeSchema', () => {
  it('parses valid scope', () => {
    const result = ControlScopeSchema.safeParse({
      class: 'execution_scope',
      kind: 'single_agent',
      target_ids: [UUID],
    });
    expect(result.success).toBe(true);
  });
});

describe('ControlActionSchema', () => {
  it('accepts all control actions', () => {
    expect(ControlActionSchema.safeParse('pause').success).toBe(true);
    expect(ControlActionSchema.safeParse('hard_stop').success).toBe(true);
    expect(ControlActionSchema.safeParse('resume').success).toBe(true);
  });
});

describe('ControlActorTypeSchema', () => {
  it('accepts principal, orchestration_agent, worker_agent', () => {
    expect(ControlActorTypeSchema.safeParse('principal').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('orchestration_agent').success).toBe(true);
    expect(ControlActorTypeSchema.safeParse('worker_agent').success).toBe(true);
  });
});

describe('ConfirmationTierSchema', () => {
  it('accepts T0 through T3', () => {
    expect(ConfirmationTierSchema.safeParse('T0').success).toBe(true);
    expect(ConfirmationTierSchema.safeParse('T3').success).toBe(true);
  });
});

describe('OpctlEventTypeSchema', () => {
  it('accepts opctl event types', () => {
    expect(OpctlEventTypeSchema.safeParse('opctl_command_received').success).toBe(true);
    expect(OpctlEventTypeSchema.safeParse('opctl_replay_detected').success).toBe(true);
  });
});
