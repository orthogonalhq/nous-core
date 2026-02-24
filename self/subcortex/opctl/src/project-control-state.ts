/**
 * Project control state — tracks pause/resume per project.
 * Phase 2.6 — MAO-007: getProjectControlState for dispatch gating.
 * hard_stopped comes from StartLockStore; paused_review/resuming from this store.
 */
import type { ProjectId, ProjectControlState } from '@nous/shared';

export interface ProjectControlStateStore {
  get(projectId: ProjectId): Promise<ProjectControlState | null>;
  set(projectId: ProjectId, state: ProjectControlState): Promise<void>;
  clear(projectId: ProjectId): Promise<void>;
}

/**
 * In-memory implementation for Phase 2.6 baseline.
 * Tracks pause/resuming state per project. hard_stopped is from StartLockStore.
 */
export class InMemoryProjectControlStateStore
  implements ProjectControlStateStore
{
  private stateByProject = new Map<string, ProjectControlState>();

  async get(projectId: ProjectId): Promise<ProjectControlState | null> {
    return this.stateByProject.get(projectId) ?? null;
  }

  async set(projectId: ProjectId, state: ProjectControlState): Promise<void> {
    this.stateByProject.set(projectId, state);
  }

  async clear(projectId: ProjectId): Promise<void> {
    this.stateByProject.delete(projectId);
  }
}
