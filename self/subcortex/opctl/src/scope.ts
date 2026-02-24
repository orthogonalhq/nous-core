/**
 * Scope resolution and snapshot. TOCTOU-resistant target resolution.
 */
import { createHash } from 'node:crypto';
import type { ControlScope, ScopeSnapshot } from '@nous/shared';
import { ScopeSnapshotSchema } from '@nous/shared';

/**
 * Resolves scope to a concrete target snapshot with target_ids_hash.
 * Phase 2.5: minimal resolution — project_run scope returns project_id as target.
 */
export function resolveScope(scope: ControlScope): ScopeSnapshot {
  const targetIds = scope.target_ids?.length
    ? scope.target_ids
    : scope.project_id
      ? [scope.project_id]
      : [];

  const targetIdsHash = createHash('sha256')
    .update(JSON.stringify(targetIds.sort()))
    .digest('hex');

  return ScopeSnapshotSchema.parse({
    scope,
    target_ids: targetIds,
    target_ids_hash: targetIdsHash,
    target_count: targetIds.length,
    resolved_at: new Date().toISOString(),
  });
}
