/**
 * In-memory chat thread store implementation.
 *
 * Phase 5.2 — Project-Chat-Cortex Control-Plane Runtime Binding.
 * Enforces scratch_thread non-executable until explicit bind.
 */
import type { ProjectChatThread } from '@nous/shared';
import type { IChatThreadStore } from '@nous/shared';
import type { ProjectId } from '@nous/shared';

export class InMemoryChatThreadStore implements IChatThreadStore {
  private readonly threads = new Map<string, ProjectChatThread>();

  async get(threadId: string): Promise<ProjectChatThread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async getByProject(projectId: ProjectId): Promise<ProjectChatThread[]> {
    const id = projectId as string;
    return [...this.threads.values()].filter((t) => t.project_id === id);
  }

  async store(thread: ProjectChatThread): Promise<void> {
    this.threads.set(thread.thread_id, { ...thread });
  }

  async update(thread: ProjectChatThread): Promise<void> {
    if (!this.threads.has(thread.thread_id)) {
      throw new Error(`Thread ${thread.thread_id} not found`);
    }
    this.threads.set(thread.thread_id, { ...thread });
  }
}
