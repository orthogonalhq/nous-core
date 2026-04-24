/**
 * SUP-003 — Agent exceeded scope boundary (tool outside allow-list). S1 / auto-pause.
 *
 * Taxonomy row (`supervisor-violation-taxonomy-v1.md § Invariant Code Catalog`):
 *   Code      Severity  Enforcement  Echoes   Detection Source
 *   SUP-003   S1        auto_pause   —        Outbox tool call name vs. the agent's scoped tool surface.
 *
 * Mechanism (SDS § Detector-by-detector mechanism ledger § SUP-003):
 *   Contract-grounded set-membership. Candidate iff
 *     `observation.toolCall !== null`
 *     && `context.toolSurface !== null`
 *     && !context.toolSurface.allowedToolNames.includes('*')
 *     && !context.toolSurface.isAllowed(observation.toolCall.name)`.
 *   When `context.toolSurface` is null (no surface registered for the
 *   class) or contains the `'*'` wildcard (cortex tier), SUP-003 does not
 *   fire. See `supervisor-scope-boundary-v1.md § Agent Class Ladder`.
 */
import type { SupervisorObservation } from '@nous/shared';
import type {
  DetectorContext,
  DetectorFn,
  SupervisorViolationCandidate,
} from './types.js';

export const detectSup003ScopeBoundary: DetectorFn = async (
  input: SupervisorObservation,
  context: DetectorContext,
): Promise<SupervisorViolationCandidate | null> => {
  if (input.toolCall === null) return null;
  if (context.toolSurface === null) return null;
  if (context.toolSurface.allowedToolNames.includes('*')) return null;
  if (context.toolSurface.isAllowed(input.toolCall.name)) return null;
  return {
    supCode: 'SUP-003',
    severity: 'S1',
    reason: `Agent (class ${context.toolSurface.agentClass}) attempted tool '${input.toolCall.name}' which is not on its scoped tool surface.`,
    detail: {
      toolCallName: input.toolCall.name,
      agentClass: context.toolSurface.agentClass,
      allowedToolCount: context.toolSurface.allowedToolNames.length,
    },
  };
};

export default detectSup003ScopeBoundary;
