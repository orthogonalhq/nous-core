/**
 * In-memory project-to-taxonomy mapping.
 *
 * Phase 6.2: Project tags and reverse lookup by tag.
 */
import type { ProjectId } from '@nous/shared';
import { TaxonomyTagSchema } from '@nous/shared';

export interface IProjectTaxonomyMapping {
  getTagsForProject(projectId: ProjectId): Promise<string[]>;
  setTagsForProject(projectId: ProjectId, tags: string[]): Promise<void>;
  getProjectsForTag(tag: string): Promise<ProjectId[]>;
}

export class InMemoryProjectTaxonomyMapping implements IProjectTaxonomyMapping {
  private readonly projectToTags = new Map<string, Set<string>>();
  private readonly tagToProjects = new Map<string, Set<string>>();

  private syncTagToProjects(tag: string, projectId: string, add: boolean): void {
    let set = this.tagToProjects.get(tag);
    if (!set) {
      set = new Set();
      this.tagToProjects.set(tag, set);
    }
    if (add) set.add(projectId);
    else set.delete(projectId);
  }

  async getTagsForProject(projectId: ProjectId): Promise<string[]> {
    const tags = this.projectToTags.get(projectId);
    return tags ? Array.from(tags).sort() : [];
  }

  async setTagsForProject(projectId: ProjectId, tags: string[]): Promise<void> {
    const oldTags = this.projectToTags.get(projectId);
    if (oldTags) {
      for (const t of oldTags) this.syncTagToProjects(t, projectId, false);
    }
    const validTags = tags.map((t) => TaxonomyTagSchema.parse(t));
    const newSet = new Set(validTags);
    this.projectToTags.set(projectId, newSet);
    for (const t of newSet) this.syncTagToProjects(t, projectId, true);
  }

  async getProjectsForTag(tag: string): Promise<ProjectId[]> {
    const projects = this.tagToProjects.get(tag);
    return projects ? (Array.from(projects) as ProjectId[]) : [];
  }
}
