/**
 * U2 legacy model-role migration helper.
 *
 * Provides a single shared function for remapping legacy 7-role taxonomy
 * literals to the canonical 4-role architectural-layer taxonomy (WR-142).
 *
 * Called from:
 * - autonomic/config loader.ts (system config pre-safeParse)
 * - shared/types/workflow.ts (WorkflowModelCallNodeConfigSchema preprocess)
 * - shared/types/project.ts (NodeSchemaDefinition + ProjectConfigSchema preprocess)
 */
import type { ModelRole } from './enums.js';

const LEGACY_REMAP: Record<string, ModelRole> = {
  reasoner: 'cortex-chat',
  orchestrator: 'orchestrators',
};

const LEGACY_DROPPED = new Set([
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
]);

/**
 * Migrate a legacy model-role string to the canonical 4-role taxonomy.
 *
 * @returns The canonical ModelRole string if remapped, `null` if the legacy
 *          role should be silently dropped, or the original string unchanged
 *          if it is already canonical or unrecognized.
 */
export function migrateLegacyModelRole(legacy: string): ModelRole | null | string {
  if (legacy in LEGACY_REMAP) return LEGACY_REMAP[legacy]!;
  if (LEGACY_DROPPED.has(legacy)) return null;
  return legacy;
}
