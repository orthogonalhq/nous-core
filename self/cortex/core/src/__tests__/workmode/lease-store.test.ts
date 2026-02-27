/**
 * Lease store behavior tests.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { InMemoryLeaseStore } from '../../workmode/lease-store.js';
import type { LeaseContract } from '@nous/shared';

function createLease(overrides: Partial<LeaseContract> = {}): LeaseContract {
  const now = new Date();
  const expires = new Date(now.getTime() + 3600000);
  return {
    lease_id: randomUUID() as import('@nous/shared').LeaseId,
    project_run_id: randomUUID(),
    workmode_id: 'system:implementation',
    entrypoint_ref: '@.skills/',
    sop_ref: '@.skills/',
    scope_ref: '.worklog/',
    context_profile: 'implementation',
    ttl: 3600,
    issued_by: 'nous_cortex',
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    revocation_ref: null,
    ...overrides,
  };
}

describe('InMemoryLeaseStore', () => {
  it('store() and getActive() return lease', () => {
    const store = new InMemoryLeaseStore();
    const lease = createLease();
    store.store(lease);
    expect(store.getActive(lease.project_run_id)).toEqual(lease);
  });

  it('getActive() returns null for unknown project run', () => {
    const store = new InMemoryLeaseStore();
    expect(store.getActive(randomUUID())).toBeNull();
  });

  it('getActive() returns null for revoked lease', () => {
    const store = new InMemoryLeaseStore();
    const lease = createLease();
    store.store(lease);
    store.revoke(lease.lease_id);
    expect(store.getActive(lease.project_run_id)).toBeNull();
  });

  it('getActive() returns null for expired lease', () => {
    const store = new InMemoryLeaseStore();
    const past = new Date(Date.now() - 7200000);
    const lease = createLease({
      issued_at: past.toISOString(),
      expires_at: new Date(past.getTime() + 3600000).toISOString(),
    });
    store.store(lease);
    expect(store.getActive(lease.project_run_id)).toBeNull();
  });
});
