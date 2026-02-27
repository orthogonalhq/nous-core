/**
 * In-memory lease store implementation.
 *
 * Phase 5.1 — Workmode Enforcement and Authority-Chain Baseline.
 */
import type { LeaseContract, LeaseId } from '@nous/shared';
import type { ILeaseStore } from '@nous/shared';

export class InMemoryLeaseStore implements ILeaseStore {
  private readonly leases = new Map<string, LeaseContract>();
  private readonly byProjectRun = new Map<string, string>(); // projectRunId -> leaseId

  store(lease: LeaseContract): void {
    const key = lease.lease_id as string;
    this.leases.set(key, lease);
    this.byProjectRun.set(lease.project_run_id, key);
  }

  getActive(projectRunId: string): LeaseContract | null {
    const leaseId = this.byProjectRun.get(projectRunId);
    if (!leaseId) return null;

    const lease = this.leases.get(leaseId);
    if (!lease) return null;
    if (lease.revocation_ref !== null) return null;

    const now = new Date().toISOString();
    if (lease.expires_at < now) return null;

    return lease;
  }

  revoke(leaseId: LeaseId): void {
    const lease = this.leases.get(leaseId as string);
    if (lease) {
      const revoked = { ...lease, revocation_ref: `revoked-${Date.now()}` };
      this.leases.set(leaseId as string, revoked);
    }
  }

  pruneExpired(): void {
    const now = new Date().toISOString();
    for (const [leaseId, lease] of this.leases) {
      if (lease.expires_at < now || lease.revocation_ref !== null) {
        this.leases.delete(leaseId);
        this.byProjectRun.delete(lease.project_run_id);
      }
    }
  }
}
