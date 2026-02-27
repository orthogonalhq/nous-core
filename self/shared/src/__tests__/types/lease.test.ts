/**
 * Lease schema contract tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import { LeaseIdSchema } from '../../types/ids.js';
import { LeaseContractSchema } from '../../types/lease.js';
import { randomUUID } from 'crypto';

describe('LeaseIdSchema', () => {
  it('accepts valid UUID', () => {
    const id = randomUUID();
    expect(LeaseIdSchema.safeParse(id).success).toBe(true);
  });

  it('rejects non-UUID', () => {
    expect(LeaseIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('LeaseContractSchema', () => {
  const validLease = {
    lease_id: randomUUID(),
    project_run_id: randomUUID(),
    workmode_id: 'system:implementation',
    entrypoint_ref: '@.skills/',
    sop_ref: '@.skills/',
    scope_ref: '.worklog/',
    context_profile: 'implementation',
    ttl: 3600,
    issued_by: 'nous_cortex',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    revocation_ref: null,
  };

  it('parses valid lease', () => {
    expect(LeaseContractSchema.safeParse(validLease).success).toBe(true);
  });

  it('requires issued_by to be nous_cortex', () => {
    const invalid = { ...validLease, issued_by: 'other' };
    expect(LeaseContractSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts optional budget_ref', () => {
    const withBudget = { ...validLease, budget_ref: 'budget-1' };
    expect(LeaseContractSchema.safeParse(withBudget).success).toBe(true);
  });

  it('accepts revocation_ref', () => {
    const revoked = { ...validLease, revocation_ref: 'revoked-123' };
    expect(LeaseContractSchema.safeParse(revoked).success).toBe(true);
  });
});
