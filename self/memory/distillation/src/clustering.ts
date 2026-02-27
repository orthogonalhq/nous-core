/**
 * Deterministic clustering of experience records for distillation.
 * Phase 4.3: Tag and project strategies. Semantic deferred.
 */
import type { ExperienceRecord, ExperienceCluster } from '@nous/shared';
import {
  ExperienceClusterSchema,
  DEFAULT_DISTILLATION_CLUSTER_CONFIG,
  DistillationClusterConfigSchema,
  type DistillationClusterConfig,
} from '@nous/shared';

/**
 * Cluster experience records by project. Deterministic: same input → same output.
 * Tie-break by entry.id lexicographic.
 */
function clusterByProject(
  records: ExperienceRecord[],
  config: DistillationClusterConfig,
): ExperienceCluster[] {
  const byProject = new Map<string, ExperienceRecord[]>();
  for (const r of records) {
    const key = r.projectId ?? 'global';
    let list = byProject.get(key);
    if (!list) {
      list = [];
      byProject.set(key, list);
    }
    list.push(r);
  }

  const clusters: ExperienceCluster[] = [];
  for (const [projectId, list] of byProject) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i += config.maxClusterSize) {
      const chunk = sorted.slice(i, i + config.maxClusterSize);
      if (chunk.length >= config.minClusterSize) {
        clusters.push(
          ExperienceClusterSchema.parse({
            records: chunk,
            clusterKey: `${projectId}:${i}`,
            projectId: projectId === 'global' ? undefined : (projectId as any),
          }),
        );
      }
    }
  }
  return clusters;
}

/**
 * Cluster experience records by tag overlap. Records with shared tags form clusters.
 * Deterministic: same input → same output. Tie-break by entry.id.
 */
function clusterByTag(
  records: ExperienceRecord[],
  config: DistillationClusterConfig,
): ExperienceCluster[] {
  const minOverlap = config.tagOverlapMin ?? 1;
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const clusters: ExperienceCluster[] = [];
  const used = new Set<string>();

  for (const rec of sorted) {
    if (used.has(rec.id)) continue;
    const recTags = new Set(rec.tags);
    const group: ExperienceRecord[] = [rec];
    used.add(rec.id);

    for (const other of sorted) {
      if (used.has(other.id) || group.length >= config.maxClusterSize) continue;
      const otherTags = new Set(other.tags);
      let overlap = 0;
      for (const t of recTags) {
        if (otherTags.has(t)) overlap++;
      }
      if (overlap >= minOverlap) {
        group.push(other);
        used.add(other.id);
      }
    }

    if (group.length >= config.minClusterSize) {
      group.sort((a, b) => a.id.localeCompare(b.id));
      clusters.push(
        ExperienceClusterSchema.parse({
          records: group,
          clusterKey: group.map((r) => r.id).sort().join(','),
          projectId: rec.projectId,
        }),
      );
    }
  }
  return clusters;
}

/**
 * Identify clusters of related experience records.
 * Deterministic for equivalent input.
 */
export function identifyClusters(
  records: ExperienceRecord[],
  config: DistillationClusterConfig = DEFAULT_DISTILLATION_CLUSTER_CONFIG,
): ExperienceCluster[] {
  const parsed = DistillationClusterConfigSchema.parse(config);
  const active = records.filter(
    (r) => r.lifecycleStatus !== 'superseded' && r.lifecycleStatus !== 'soft-deleted',
  );
  if (active.length === 0) return [];

  switch (parsed.clusteringStrategy) {
    case 'project':
      return clusterByProject(active, parsed);
    case 'tag':
      return clusterByTag(active, parsed);
    case 'semantic':
      return clusterByProject(active, parsed);
    default:
      return clusterByProject(active, parsed);
  }
}
