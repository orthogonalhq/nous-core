/**
 * Start lock state — hard_stopped projects enforce start_lock until Principal release.
 * START-004.
 */
import type { ProjectId } from '@nous/shared';

export interface StartLockStore {
  hasStartLock(projectId: ProjectId): Promise<boolean>;
  setStartLock(projectId: ProjectId, locked: boolean): Promise<void>;
}

/**
 * In-memory implementation for Phase 2.5 baseline.
 */
export class InMemoryStartLockStore implements StartLockStore {
  private lockedProjects = new Set<string>();

  async hasStartLock(projectId: ProjectId): Promise<boolean> {
    return this.lockedProjects.has(projectId);
  }

  async setStartLock(projectId: ProjectId, locked: boolean): Promise<void> {
    if (locked) {
      this.lockedProjects.add(projectId);
    } else {
      this.lockedProjects.delete(projectId);
    }
  }
}
