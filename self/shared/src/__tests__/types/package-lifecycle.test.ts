import { describe, it, expect } from 'vitest';
import {
  PackageLifecycleEventBaseSchema,
  PackageLifecycleDecisionEventSchema,
} from '../../types/package-lifecycle.js';

const BASE_EVENT = {
  event_type: 'pkg_ingest_received',
  package_id: 'skill:image-quality-assessment',
  package_version: '1.2.0',
  origin_class: 'third_party_external',
  witness_ref: 'evt_123',
} as const;

describe('PackageLifecycleEventBaseSchema', () => {
  it('accepts valid lifecycle event payloads', () => {
    const result = PackageLifecycleEventBaseSchema.safeParse(BASE_EVENT);
    expect(result.success).toBe(true);
  });

  it('requires origin_class', () => {
    const { origin_class: _removed, ...event } = BASE_EVENT;
    const result = PackageLifecycleEventBaseSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('PackageLifecycleDecisionEventSchema', () => {
  it('requires reason_code for blocked runtime decisions', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_runtime_action_decided',
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason-coded blocked runtime decisions', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_runtime_action_decided',
      reason_code: 'PKG-002-CAPABILITY_REPLAY_DETECTED',
    });
    expect(result.success).toBe(true);
  });

  it('accepts reason-coded quarantined outcomes', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_quarantined',
      reason_code: 'PKG-001-REVOKED_SIGNER',
    });
    expect(result.success).toBe(true);
  });
});

