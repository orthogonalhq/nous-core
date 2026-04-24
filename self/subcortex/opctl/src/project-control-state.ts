/**
 * Project control state — tracks pause/resume per project.
 * Phase 2.6 — MAO-007: getProjectControlState for dispatch gating.
 * hard_stopped comes from StartLockStore; paused_review/resuming from this store.
 *
 * WR-162 SP 5 — SUPV-SP5-009/010: adds `supervisor_enforcement_lock` state on
 * the same in-memory record. Three new methods operate exclusively on the
 * lock fields; the existing `get`/`set`/`clear` methods remain unchanged
 * and continue to read/write only the `state` field.
 *
 * The internal `StoredProjectControlState` shape is NOT exported across
 * packages — keep the widening surgical (Goals SC 16/17 / SUPV-SP5-006).
 */
import type { ProjectId, ProjectControlState } from '@nous/shared';

/**
 * Supervisor enforcement lock provenance — written by `setSupervisorLock`
 * when a supervisor-actor command applies; cleared atomically on
 * principal-authorized resume. See `supervisor-escalation-policy-v1.md
 * § ESC-001`.
 */
export interface SupervisorEnforcementLockFields {
  readonly sup_code: string;
  readonly severity: string;
  readonly set_at: string;
}

export interface SupervisorEnforcementLockSnapshot {
  readonly locked: boolean;
  readonly sup_code: string | null;
  readonly severity: string | null;
  readonly set_at: string | null;
}

/**
 * Internal stored shape — the in-memory record carries the SP 3 `state`
 * field AND the SP 5 `supervisor_enforcement_lock` fields side-by-side
 * on the same record. The two halves are operated on by disjoint method
 * sets so writes to one cannot touch the other (SUPV-SP5-006).
 */
interface StoredProjectControlState {
  state: ProjectControlState | null;
  lock: SupervisorEnforcementLockFields | null;
}

export interface ProjectControlStateStore {
  get(projectId: ProjectId): Promise<ProjectControlState | null>;
  set(projectId: ProjectId, state: ProjectControlState): Promise<void>;
  clear(projectId: ProjectId): Promise<void>;
  /** WR-162 SP 5 — SUPV-SP5-010. Default (unset) returns `{ locked: false }`. */
  getSupervisorLock(
    projectId: ProjectId,
  ): Promise<SupervisorEnforcementLockSnapshot>;
  /** WR-162 SP 5 — SUPV-SP5-009. Persists provenance fields verbatim. */
  setSupervisorLock(
    projectId: ProjectId,
    fields: SupervisorEnforcementLockFields,
  ): Promise<void>;
  /** WR-162 SP 5 — SUPV-SP5-010. Atomic clear (runs inside opctl's resume try/block). */
  clearSupervisorLock(projectId: ProjectId): Promise<void>;
}

/**
 * In-memory implementation for Phase 2.6 baseline.
 * Tracks pause/resuming state per project. hard_stopped is from StartLockStore.
 *
 * WR-162 SP 5 — adds `supervisor_enforcement_lock` fields on the same
 * internal record. Unset projects return a default-lock snapshot
 * (`{ locked: false, sup_code: null, severity: null, set_at: null }`).
 */
export class InMemoryProjectControlStateStore
  implements ProjectControlStateStore
{
  private records = new Map<string, StoredProjectControlState>();

  private ensureRecord(projectId: string): StoredProjectControlState {
    let rec = this.records.get(projectId);
    if (rec === undefined) {
      rec = { state: null, lock: null };
      this.records.set(projectId, rec);
    }
    return rec;
  }

  async get(projectId: ProjectId): Promise<ProjectControlState | null> {
    return this.records.get(projectId)?.state ?? null;
  }

  async set(projectId: ProjectId, state: ProjectControlState): Promise<void> {
    const rec = this.ensureRecord(projectId);
    rec.state = state;
  }

  async clear(projectId: ProjectId): Promise<void> {
    const rec = this.records.get(projectId);
    if (rec === undefined) return;
    rec.state = null;
    if (rec.lock === null) {
      // Drop the record entirely when both halves are empty.
      this.records.delete(projectId);
    }
  }

  async getSupervisorLock(
    projectId: ProjectId,
  ): Promise<SupervisorEnforcementLockSnapshot> {
    const lock = this.records.get(projectId)?.lock ?? null;
    if (lock === null) {
      return { locked: false, sup_code: null, severity: null, set_at: null };
    }
    return {
      locked: true,
      sup_code: lock.sup_code,
      severity: lock.severity,
      set_at: lock.set_at,
    };
  }

  async setSupervisorLock(
    projectId: ProjectId,
    fields: SupervisorEnforcementLockFields,
  ): Promise<void> {
    const rec = this.ensureRecord(projectId);
    rec.lock = {
      sup_code: fields.sup_code,
      severity: fields.severity,
      set_at: fields.set_at,
    };
  }

  async clearSupervisorLock(projectId: ProjectId): Promise<void> {
    const rec = this.records.get(projectId);
    if (rec === undefined) return;
    rec.lock = null;
    if (rec.state === null) {
      this.records.delete(projectId);
    }
  }
}
