import { describe, it, expect } from 'vitest';
import {
  PackageLifecycleDecisionEventSchema,
  PackageLifecycleEventBaseSchema,
} from '../../types/package-lifecycle.js';

const BASE_EVENT = {
  event_type: 'pkg_ingest_received',
  package_id: 'skill:image-quality-assessment',
  package_version: '1.2.0',
  origin_class: 'third_party_external',
  witness_ref: 'evt_abc123',
};

describe('PackageLifecycleEventBaseSchema', () => {
  it('accepts a valid lifecycle event', () => {
    const result = PackageLifecycleEventBaseSchema.safeParse(BASE_EVENT);
    expect(result.success).toBe(true);
  });

  it('requires origin_class', () => {
    const { origin_class: _removed, ...event } = BASE_EVENT;
    const result = PackageLifecycleEventBaseSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('requires witness_ref', () => {
    const { witness_ref: _removed, ...event } = BASE_EVENT;
    const result = PackageLifecycleEventBaseSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('PackageLifecycleDecisionEventSchema', () => {
  it('requires reason_code for denial and blocked events', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_enable_blocked',
    });
    expect(result.success).toBe(false);
  });

  it('accepts reason_code for blocked events', () => {
    const result = PackageLifecycleDecisionEventSchema.safeParse({
      ...BASE_EVENT,
      event_type: 'pkg_enable_blocked',
      reason_code: 'PKG-001-UNSIGNED',
    });
    expect(result.success).toBe(true);
  });
});

