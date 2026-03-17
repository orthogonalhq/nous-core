import { describe, it, expect, vi } from 'vitest';
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

describe('RuntimeMembrane', () => {
  it('allows API-mediated actions with valid admission and capability grant', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await membrane.execute(BASE_PAYLOAD);
    expect(result.success).toBe(true);
    expect(result.decision.decision).toBe('allow');
  });

  it('denies actions when capability is not declared', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await membrane.execute({
      ...BASE_PAYLOAD,
      declared_capabilities: ['tool.execute'],
    });
    expect(result.success).toBe(false);
    expect(result.decision.decision).toBe('deny');
    expect(result.decision.reason_code).toBe('PKG-002-CAPABILITY_NOT_GRANTED');
  });

  it('quarantines runtime for invalid signer posture', async () => {
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
    });
    const result = await membrane.execute({
      ...BASE_PAYLOAD,
      admission: {
        ...BASE_PAYLOAD.admission,
        signer_known: false,
      },
    });
    expect(result.success).toBe(false);
    expect(result.decision.decision).toBe('quarantine');
    expect(result.decision.reason_code).toBe('PKG-001-REVOKED_SIGNER');
  });

  it('returns deterministic decisions for identical payloads with independent membrane instances', async () => {
    const now = () => new Date('2026-03-01T00:30:00.000Z');
    const membraneA = new RuntimeMembrane({ now });
    const membraneB = new RuntimeMembrane({ now });

    const resultA = await membraneA.execute(BASE_PAYLOAD);
    const resultB = await membraneB.execute(BASE_PAYLOAD);

    expect(resultA.decision.decision).toBe(resultB.decision.decision);
    expect(resultA.decision.reason_code).toBe(resultB.decision.reason_code);
  });

  it('uses onAllow as the only allow-path execution seam and does not invoke it on deny', async () => {
    const onAllow = vi.fn().mockResolvedValue({ status: 'spawned' });
    const membrane = new RuntimeMembrane({
      now: () => new Date('2026-03-01T00:30:00.000Z'),
      onAllow,
    });

    const allowed = await membrane.execute(BASE_PAYLOAD);
    const denied = await membrane.execute({
      ...BASE_PAYLOAD,
      declared_capabilities: ['tool.execute'],
    });

    expect(allowed.success).toBe(true);
    expect(allowed.output).toEqual({ status: 'spawned' });
    expect(denied.success).toBe(false);
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onAllow).toHaveBeenCalledWith(BASE_PAYLOAD);
  });
});
