/**
 * Discovery orchestrator — combines meta-vectors, taxonomy, relationships.
 *
 * Phase 6.3: Query-time project selection with deterministic merge and audit.
 * Phase 6.4: Explainability per result; trace linkage to evidence.
 */
import type {
  DiscoveryOrchestratorInput,
  DiscoveryOrchestratorOutput,
  DiscoveryResult,
  DiscoveryAudit,
  ProjectId,
  CrossProjectRecommendationExplainability,
} from '@nous/shared';
import {
  DiscoveryOrchestratorInputSchema,
  DiscoveryOrchestratorOutputSchema,
} from '@nous/shared';
import type { IMetaVectorStore } from '../meta-vectors/meta-vector-store.js';
import type { IProjectTaxonomyMapping } from '../taxonomy/project-taxonomy-mapping.js';
import type { IRelationshipGraphStore } from '../relationships/relationship-graph-store.js';

const MERGE_STRATEGY = 'meta-vector-primary-taxonomy-relationship-boost';

export interface IDiscoveryOrchestrator {
  discoverRelevantProjects(
    input: DiscoveryOrchestratorInput,
  ): Promise<DiscoveryOrchestratorOutput>;
}

export interface DiscoveryOrchestratorDeps {
  metaVectorStore: IMetaVectorStore;
  taxonomyMapping: IProjectTaxonomyMapping;
  relationshipGraphStore: IRelationshipGraphStore;
}

export class DiscoveryOrchestrator implements IDiscoveryOrchestrator {
  constructor(private readonly deps: DiscoveryOrchestratorDeps) {}

  async discoverRelevantProjects(
    input: DiscoveryOrchestratorInput,
  ): Promise<DiscoveryOrchestratorOutput> {
    const parsed = DiscoveryOrchestratorInputSchema.parse(input);
    const { queryVector, topK, requestingProjectId } = parsed;

    const requestingTags = parsed.includeTaxonomy
      ? await this.deps.taxonomyMapping.getTagsForProject(requestingProjectId)
      : [];

    const scoreMap = new Map<string, { meta: number; taxonomy: number; rel: number }>();

    if (parsed.includeMetaVector) {
      const metaResults = await this.deps.metaVectorStore.search(
        queryVector,
        topK * 3,
      );
      for (const r of metaResults) {
        const id = String(r.projectId);
        const existing = scoreMap.get(id);
        const meta = r.similarity;
        if (existing) {
          existing.meta = Math.max(existing.meta, meta);
        } else {
          scoreMap.set(id, { meta, taxonomy: 0, rel: 0 });
        }
      }
    }

    if (scoreMap.size === 0 && (parsed.includeTaxonomy || parsed.includeRelationships)) {
      if (parsed.includeTaxonomy) {
        for (const tag of requestingTags) {
          const projects = await this.deps.taxonomyMapping.getProjectsForTag(tag);
          for (const pid of projects) {
            const id = String(pid);
            if (!scoreMap.has(id)) scoreMap.set(id, { meta: 0, taxonomy: 0, rel: 0 });
          }
        }
      }
      if (parsed.includeRelationships) {
        const edges = await this.deps.relationshipGraphStore.getEdges(
          requestingProjectId,
        );
        for (const e of edges) {
          const id = String(e.targetProjectId);
          if (!scoreMap.has(id)) scoreMap.set(id, { meta: 0, taxonomy: 0, rel: 0 });
        }
      }
    }

    const projectIds = Array.from(scoreMap.keys());
    for (const pid of projectIds) {
      if (parsed.includeTaxonomy && requestingTags.length > 0) {
        const tags = await this.deps.taxonomyMapping.getTagsForProject(pid as ProjectId);
        const overlap = tags.filter((t) => requestingTags.includes(t)).length;
        const boost = overlap > 0 ? 0.1 * Math.min(overlap, 5) : 0;
        const entry = scoreMap.get(pid)!;
        entry.taxonomy = boost;
      }
    }

    if (parsed.includeRelationships) {
      const edges = await this.deps.relationshipGraphStore.getEdges(
        requestingProjectId,
      );
      for (const e of edges) {
        const id = String(e.targetProjectId);
        const entry = scoreMap.get(id);
        if (entry) {
          entry.rel = Math.max(entry.rel, e.strength * 0.2);
        }
      }
    }

    const results: DiscoveryResult[] = [];
    for (const [id, scores] of scoreMap) {
      const combined =
        scores.meta + scores.taxonomy + scores.rel;
      results.push({
        projectId: id as ProjectId,
        rank: 0,
        combinedScore: combined,
        metaVectorScore: scores.meta > 0 ? scores.meta : undefined,
        taxonomyBoost: scores.taxonomy > 0 ? scores.taxonomy : undefined,
        relationshipBoost: scores.rel > 0 ? scores.rel : undefined,
      });
    }

    results.sort((a, b) => {
      if (b.combinedScore !== a.combinedScore)
        return b.combinedScore - a.combinedScore;
      return String(a.projectId).localeCompare(String(b.projectId));
    });

    const top = results.slice(0, topK).map((r, i) => ({
      ...r,
      rank: i + 1,
    }));

    const explainability: CrossProjectRecommendationExplainability[] = [];
    for (let i = 0; i < top.length; i++) {
      const r = top[i]!;
      const scores = scoreMap.get(String(r.projectId)) ?? {
        meta: 0,
        taxonomy: 0,
        rel: 0,
      };
      const influencingSource =
        scores.meta > 0 && (scores.taxonomy > 0 || scores.rel > 0)
          ? 'combined'
          : scores.meta > 0
            ? 'meta_vector'
            : scores.taxonomy > 0 && scores.rel > 0
              ? 'combined'
              : scores.taxonomy > 0
                ? 'taxonomy'
                : 'relationship';
      const tags =
        parsed.includeTaxonomy && requestingTags.length > 0
          ? await this.deps.taxonomyMapping.getTagsForProject(
              r.projectId as ProjectId,
            )
          : [];
      explainability.push({
        resultIndex: i,
        projectId: r.projectId,
        influencingSource,
        metaVectorScore: r.metaVectorScore,
        taxonomyTags: tags.length > 0 ? tags : undefined,
        evidenceRefs: [{ actionCategory: 'mao-projection' as const }],
      });
    }

    const audit: DiscoveryAudit = {
      traceId: undefined,
      projectIdsDiscovered: top.map((r) => r.projectId),
      metaVectorCount: parsed.includeMetaVector ? scoreMap.size : 0,
      taxonomyCount: requestingTags.length,
      relationshipCount: parsed.includeRelationships
        ? (await this.deps.relationshipGraphStore.getEdges(requestingProjectId))
            .length
        : 0,
      mergeStrategy: MERGE_STRATEGY,
    };

    return DiscoveryOrchestratorOutputSchema.parse({
      projectIds: top.map((r) => r.projectId),
      results: top,
      audit,
      explainability,
    });
  }
}
