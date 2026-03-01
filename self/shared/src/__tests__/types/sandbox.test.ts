import { describe, it, expect } from 'vitest';
import {
  SandboxPayloadSchema,
  SandboxResultSchema,
  CapabilityGrantSchema,
} from '../../types/sandbox.js';

const BASE_PAYLOAD = {
  source: 'export async function run() { return "ok"; }',
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
} as const;

describe('SandboxPayloadSchema', () => {
  it('accepts valid membrane payloads', () => {
    const result = SandboxPayloadSchema.safeParse(BASE_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it('rejects payloads missing required package/action fields', () => {
    const result = SandboxPayloadSchema.safeParse({
      ...BASE_PAYLOAD,
      action: {
        ...BASE_PAYLOAD.action,
        requested_capability: '',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('CapabilityGrantSchema', () => {
  it('accepts valid capability grants', () => {
    const result = CapabilityGrantSchema.safeParse({
      grant_id: 'grant-1',
      package_id: 'skill:image-quality-assessment',
      project_id: 'project-123',
      capability: 'model.invoke',
      approved_by: 'principal-1',
      confirmation_proof_ref: 'proof-1',
      nonce: 'nonce-1',
      issued_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      scope: {
        action_surfaces: ['model'],
      },
      status: 'active',
    });
    expect(result.success).toBe(true);
  });
});

describe('SandboxResultSchema', () => {
  it('requires reason_code for deny decisions', () => {
    const result = SandboxResultSchema.safeParse({
      success: false,
      decision: {
        decision: 'deny',
      },
      output: null,
      resourceUsage: {
        durationMs: 1,
        memoryMb: 1,
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts allow decisions without reason code', () => {
    const result = SandboxResultSchema.safeParse({
      success: true,
      decision: {
        decision: 'allow',
      },
      output: { ok: true },
      resourceUsage: {
        durationMs: 1,
        memoryMb: 1,
      },
    });
    expect(result.success).toBe(true);
  });
});

