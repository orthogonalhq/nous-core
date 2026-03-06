import { describe, it, expect } from 'vitest';
import { RuntimeMembrane } from '../runtime-membrane.js';
import type { SandboxPayload } from '@nous/shared';

const BASE_PAYLOAD: SandboxPayload = {
  source: 'export const run = () => "ok";',
  package_id: 'skill:image-quality-assessment',
  package_version: '1.0.0',
  package_type: 'skill',
  origin_class: 'third_party_external',
  declared_capabilities: ['model.invoke'],
  admission: {
    signature_valid: true,
    signer_known: true,
    api_compatible: true,
    policy_compatible: true,
    is_draft_unsigned: false,
    is_imported: false,
    reverification_complete: true,
    reapproval_complete: true,
  },
  action: {
    surface: 'model',
    action: 'invoke',
    requested_capability: 'model.invoke',
    requires_approval: true,
    direct_access_target: 'none',
  },
  runtime: {
    project_id: 'project-123',
    policy_profile: 'default',
    control_state: 'running',
  },
  capability_grant: {
    grant_id: 'grant-1',
    package_id: 'skill:image-quality-assessment',
    project_id: 'project-123',
    capability: 'model.invoke',
    approved_by: 'principal-1',
    confirmation_proof_ref: 'proof-1',
    nonce: 'nonce-1',
    issued_at: '2026-03-01T00:00:00.000Z',
    expires_at: '2026-03-01T01:00:00.000Z',
    scope: {
      action_surfaces: ['model'],
      action_names: ['invoke'],
    },
    status: 'active',
  },
};

describe('RuntimeMembrane adversarial suite', () => {
  it('blocks replay attempts with reused grant nonce', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });

    const first = await membrane.execute(BASE_PAYLOAD);
    const second = await membrane.execute(BASE_PAYLOAD);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.decision.reason_code).toBe('PKG-002-CAPABILITY_REPLAY_DETECTED');
  });

  it('blocks expired capability grants', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T02:30:00.000Z'),
    });
    const result = await membrane.execute(BASE_PAYLOAD);
    expect(result.success).toBe(false);
    expect(result.decision.reason_code).toBe('PKG-002-CAPABILITY_GRANT_EXPIRED');
  });

  it('blocks policy-incompatible runtime requests', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await membrane.execute({
      ...BASE_PAYLOAD,
      admission: {
        ...BASE_PAYLOAD.admission,
        policy_compatible: false,
      },
    });
    expect(result.success).toBe(false);
    expect(result.decision.reason_code).toBe('PKG-003-POLICY_INCOMPATIBLE');
  });

  it('denies direct runtime/filesystem/network access attempts', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await membrane.execute({
      ...BASE_PAYLOAD,
      action: {
        ...BASE_PAYLOAD.action,
        direct_access_target: 'filesystem',
      },
    });
    expect(result.success).toBe(false);
    expect(result.decision.reason_code).toBe('PKG-003-DIRECT_ACCESS_DENIED');
  });
});
