/**
 * Project-to-taxonomy mapping implementations.
 *
 * Phase 6.2: Project tags and reverse lookup by tag.
 */
import type {
  IDocumentStore,
  ProjectId,
  ProjectTaxonomyAssignment,
  TraceEvidenceReference,
} from '@nous/shared';
import { ProjectTaxonomyAssignmentSchema, TaxonomyTagSchema } from '@nous/shared';

export const KNOWLEDGE_TAXONOMY_ASSIGNMENT_COLLECTION =
  'knowledge_taxonomy_assignments';

export interface TaxonomyWriteContext {
  refreshRecordId?: string;
  evidenceRefs?: TraceEvidenceReference[];
  timestamp?: string;
}

export interface IProjectTaxonomyMapping {
  getTagsForProject(projectId: ProjectId): Promise<string[]>;
  setTagsForProject(
    projectId: ProjectId,
    tags: string[],
    context?: TaxonomyWriteContext,
  ): Promise<void>;
  getProjectsForTag(tag: string): Promise<ProjectId[]>;
  getAssignmentsForProject(
    projectId: ProjectId,
  ): Promise<ProjectTaxonomyAssignment[]>;
  replaceAssignments(
    projectId: ProjectId,
    assignments: ProjectTaxonomyAssignment[],
  ): Promise<void>;
}

export class InMemoryProjectTaxonomyMapping implements IProjectTaxonomyMapping {
  private readonly assignmentsByProject = new Map<
    string,
    Map<string, ProjectTaxonomyAssignment>
  >();
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
    const assignments = await this.getAssignmentsForProject(projectId);
    return assignments.map((assignment) => assignment.tag).sort();
  }

  async setTagsForProject(
    projectId: ProjectId,
    tags: string[],
    context: TaxonomyWriteContext = {},
  ): Promise<void> {
    const timestamp = context.timestamp ?? new Date().toISOString();
    await this.replaceAssignments(
      projectId,
      tags.map((tag) =>
        ProjectTaxonomyAssignmentSchema.parse({
          id: `${projectId}:${TaxonomyTagSchema.parse(tag)}`,
          projectId,
          tag,
          refreshRecordId:
            context.refreshRecordId ??
            '00000000-0000-0000-0000-000000000000',
          evidenceRefs: context.evidenceRefs ?? [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    );
  }

  async getProjectsForTag(tag: string): Promise<ProjectId[]> {
    const projects = this.tagToProjects.get(tag);
    return projects ? (Array.from(projects).sort() as ProjectId[]) : [];
  }

  async getAssignmentsForProject(
    projectId: ProjectId,
  ): Promise<ProjectTaxonomyAssignment[]> {
    return Array.from(this.assignmentsByProject.get(projectId)?.values() ?? []).sort(
      (left, right) => left.tag.localeCompare(right.tag),
    );
  }

  async replaceAssignments(
    projectId: ProjectId,
    assignments: ProjectTaxonomyAssignment[],
  ): Promise<void> {
    const current = this.assignmentsByProject.get(projectId);
    if (current) {
      for (const assignment of current.values()) {
        this.syncTagToProjects(assignment.tag, projectId, false);
      }
    }

    const next = new Map<string, ProjectTaxonomyAssignment>();
    for (const raw of assignments) {
      const assignment = ProjectTaxonomyAssignmentSchema.parse(raw);
      next.set(assignment.id, assignment);
      this.syncTagToProjects(assignment.tag, projectId, true);
    }
    this.assignmentsByProject.set(projectId, next);
  }
}

function parseAssignment(value: unknown): ProjectTaxonomyAssignment | null {
  const parsed = ProjectTaxonomyAssignmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class DocumentProjectTaxonomyMapping implements IProjectTaxonomyMapping {
  constructor(private readonly documentStore: IDocumentStore) {}

  async getTagsForProject(projectId: ProjectId): Promise<string[]> {
    const assignments = await this.getAssignmentsForProject(projectId);
    return assignments.map((assignment) => assignment.tag).sort();
  }

  async setTagsForProject(
    projectId: ProjectId,
    tags: string[],
    context: TaxonomyWriteContext = {},
  ): Promise<void> {
    const timestamp = context.timestamp ?? new Date().toISOString();
    await this.replaceAssignments(
      projectId,
      tags.map((tag) =>
        ProjectTaxonomyAssignmentSchema.parse({
          id: `${projectId}:${TaxonomyTagSchema.parse(tag)}`,
          projectId,
          tag,
          refreshRecordId:
            context.refreshRecordId ??
            '00000000-0000-0000-0000-000000000000',
          evidenceRefs: context.evidenceRefs ?? [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    );
  }

  async getProjectsForTag(tag: string): Promise<ProjectId[]> {
    const raw = await this.documentStore.query<unknown>(
      KNOWLEDGE_TAXONOMY_ASSIGNMENT_COLLECTION,
      {
        where: {
          tag: TaxonomyTagSchema.parse(tag),
        },
      },
    );
    return raw
      .map(parseAssignment)
      .filter(
        (assignment): assignment is ProjectTaxonomyAssignment => assignment !== null,
      )
      .map((assignment) => assignment.projectId)
      .sort();
  }

  async getAssignmentsForProject(
    projectId: ProjectId,
  ): Promise<ProjectTaxonomyAssignment[]> {
    const raw = await this.documentStore.query<unknown>(
      KNOWLEDGE_TAXONOMY_ASSIGNMENT_COLLECTION,
      {
        where: { projectId },
      },
    );
    return raw
      .map(parseAssignment)
      .filter(
        (assignment): assignment is ProjectTaxonomyAssignment => assignment !== null,
      )
      .sort((left, right) => left.tag.localeCompare(right.tag));
  }

  async replaceAssignments(
    projectId: ProjectId,
    assignments: ProjectTaxonomyAssignment[],
  ): Promise<void> {
    const existing = await this.getAssignmentsForProject(projectId);
    await Promise.all(
      existing.map((assignment) =>
        this.documentStore.delete(
          KNOWLEDGE_TAXONOMY_ASSIGNMENT_COLLECTION,
          assignment.id,
        ),
      ),
    );
    for (const raw of assignments) {
      const assignment = ProjectTaxonomyAssignmentSchema.parse(raw);
      await this.documentStore.put(
        KNOWLEDGE_TAXONOMY_ASSIGNMENT_COLLECTION,
        assignment.id,
        assignment,
      );
    }
  }
}
