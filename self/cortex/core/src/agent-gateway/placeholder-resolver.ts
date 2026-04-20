/**
 * Placeholder resolver — substitutes well-known placeholder strings for
 * project-id parameter fields with the active execution context's project ID.
 *
 * Why: models occasionally emit literal placeholder values like `"current"`,
 * `"this"`, or `"<project>"` in `projectId` parameter fields when calling
 * project-scoped tools instead of the actual UUID. The downstream Zod schema
 * (e.g., `WorkflowLifecycleListQuerySchema`) rejects these as UUID-format
 * failures, producing an opaque ZodError the model cannot self-correct from.
 *
 * This resolver runs at the gateway dispatch boundary (in `handleStandardTool`,
 * after `parseOllamaToolCalls` produces the parsed `params` object and before
 * `executeTool` is called). It substitutes the well-known placeholders for
 * `execution.projectId` so the call proceeds against the correct project.
 *
 * Hard constraints (per SDS Invariant I-6):
 *  - Top-level `projectId` and `project_id` keys ONLY. No recursion.
 *  - Pure function — returns input reference when no substitution applies.
 *  - When `execution?.projectId` is undefined, the placeholder is left
 *    unchanged; downstream Zod validation surfaces the error which the
 *    enriched `arguments_invalid` recovery frame then exposes to the model.
 */
import type { GatewayExecutionContext } from '@nous/shared';

/**
 * Top-level project-id placeholder strings the resolver substitutes.
 * Case-insensitive. Single-token literals only.
 */
const PROJECT_ID_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'current',
  'this',
  '<project>',
]);

/**
 * Resolves dispatch parameter placeholders for project-id fields.
 *
 * Pure function. Returns a NEW object when a substitution occurred; returns
 * the input reference unchanged when no substitution applied (so the caller
 * can detect "did anything happen?" via referential equality if it wants to).
 *
 * Recognises the literal placeholder strings 'current', 'this', '<project>'
 * (case-insensitive) on the TOP-LEVEL keys `projectId` and `project_id` only.
 * Does NOT walk arbitrary nested object paths. Does NOT touch real UUIDs
 * (substring inspection only — the resolver never validates UUIDs itself;
 * downstream Zod schemas at the capability handler layer enforce UUID format).
 *
 * If `execution?.projectId` is undefined, the placeholder is left unchanged
 * (the downstream Zod parse will then throw a ValidationError that the
 * RC-1 enriched recovery frame surfaces as `arguments_invalid`).
 *
 * Performance: O(1) on top-level keys. No allocation when no substitution.
 */
export function resolveDispatchParameterPlaceholders(
  params: unknown,
  execution?: GatewayExecutionContext,
): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  if (!execution?.projectId) return params; // no resolution source — leave alone
  const obj = params as Record<string, unknown>;
  const candidates = ['projectId', 'project_id'] as const;
  let mutated: Record<string, unknown> | null = null;
  for (const key of candidates) {
    const value = obj[key];
    if (typeof value !== 'string') continue;
    if (!PROJECT_ID_PLACEHOLDERS.has(value.toLowerCase())) continue;
    if (!mutated) mutated = { ...obj };
    mutated[key] = execution.projectId as unknown as string;
  }
  return mutated ?? params;
}
