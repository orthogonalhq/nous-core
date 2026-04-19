/**
 * View-state schemas for the four-class taxonomy.
 *
 * Ratified by `.architecture/.decisions/2026-04-18-project-model-and-settings/view-state-schema-v1.md`
 * (Decisions §§1–7 are binding). Class-discriminated payload narrowing; per-class
 * payloads use `.passthrough()` so future sub-keys land without schema churn; the
 * envelope uses `.strict()` to reject unknown top-level fields.
 *
 * See also: `.worklog/sprints/feat/project-model-and-settings/phase-1/phase-1.2/sds.mdx`
 * §Data Model for the design rationale.
 */
import { z } from 'zod';

// ─── Class literal ──────────────────────────────────────────────────────────

export const ViewStateClassSchema = z.enum([
  'layout',
  'navigation',
  'focus',
  'content',
]);
export type ViewStateClass = z.infer<typeof ViewStateClassSchema>;

// ─── Layout payload ─────────────────────────────────────────────────────────
// Decision §1 / Goals Cluster 1. Whole-sidebar collapsed, settings-nav
// expansion. `.passthrough()`: future Layout-class additions (e.g. pane sizes)
// land here without a schema bump.
export const LayoutPayloadSchema = z
  .object({
    sidebarCollapsed: z.boolean().optional(),
    settingsNavExpandedCategories: z.array(z.string()).optional(),
  })
  .passthrough();
export type LayoutPayload = z.infer<typeof LayoutPayloadSchema>;

// ─── Navigation payload ─────────────────────────────────────────────────────
// Decision §1 navigation fragments: activeRoute, history, params.
export const NavigationPayloadSchema = z
  .object({
    activeRoute: z.string().optional(),
    navigationHistory: z.array(z.string()).optional(),
    navigationParams: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type NavigationPayload = z.infer<typeof NavigationPayloadSchema>;

// ─── Focus payload ──────────────────────────────────────────────────────────
// Decision §1 focus fragments: sidebar selection, panel focus.
export const FocusPayloadSchema = z
  .object({
    sidebarSelection: z.string().optional(),
    panelFocus: z.string().optional(),
  })
  .passthrough();
export type FocusPayload = z.infer<typeof FocusPayloadSchema>;

// ─── Content payload ────────────────────────────────────────────────────────
// Decision §1: neutral container keyed by contentKey ('chat', 'settings',
// 'mao', future surfaces). Each content surface owns its sub-shape. V1 does
// NOT centrally register sub-schemas (Goals Risk row 8 — per-surface
// ownership; Settings owns its form-draft shape in 1.4).
export const ContentPayloadSchema = z.record(z.unknown());
export type ContentPayload = z.infer<typeof ContentPayloadSchema>;

// ─── Envelope (discriminated union on `class`) ──────────────────────────────
const BaseEnvelope = z
  .object({
    userId: z.string(),
    projectId: z.string(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ViewStateDocumentSchema = z.discriminatedUnion('class', [
  BaseEnvelope.extend({
    class: z.literal('layout'),
    payload: LayoutPayloadSchema,
  }),
  BaseEnvelope.extend({
    class: z.literal('navigation'),
    payload: NavigationPayloadSchema,
  }),
  BaseEnvelope.extend({
    class: z.literal('focus'),
    payload: FocusPayloadSchema,
  }),
  BaseEnvelope.extend({
    class: z.literal('content'),
    payload: ContentPayloadSchema,
  }),
]);
export type ViewStateDocument = z.infer<typeof ViewStateDocumentSchema>;

// ─── Class → payload type map (for hook generics) ───────────────────────────
export type PayloadFor<C extends ViewStateClass> = C extends 'layout'
  ? LayoutPayload
  : C extends 'navigation'
    ? NavigationPayload
    : C extends 'focus'
      ? FocusPayload
      : C extends 'content'
        ? ContentPayload
        : never;

// ─── tRPC input/output schemas ──────────────────────────────────────────────
// Per SDS Invariant #3 / Decision §7: `userId` is structurally absent from
// both input schemas. The server derives `userId` from `ctx.userId`. Any
// client-supplied `userId` field is rejected at the Zod `.strict()` boundary.

export const ViewStateGetInputSchema = z
  .object({
    projectId: z.string().min(1),
    class: ViewStateClassSchema,
  })
  .strict();

export const ViewStateSetInputSchema = z.discriminatedUnion('class', [
  z
    .object({
      class: z.literal('layout'),
      projectId: z.string().min(1),
      payload: LayoutPayloadSchema,
      updatedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      class: z.literal('navigation'),
      projectId: z.string().min(1),
      payload: NavigationPayloadSchema,
      updatedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      class: z.literal('focus'),
      projectId: z.string().min(1),
      payload: FocusPayloadSchema,
      updatedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      class: z.literal('content'),
      projectId: z.string().min(1),
      payload: ContentPayloadSchema,
      updatedAt: z.string().datetime(),
    })
    .strict(),
]);

export const ViewStateGetResultSchema = z
  .object({
    payload: z.unknown(),
    updatedAt: z.string().datetime(),
  })
  .nullable();

export const ViewStateSetResultSchema = z.object({
  updatedAt: z.string().datetime(),
});

// ─── Storage constants + key helper ─────────────────────────────────────────

export const VIEW_STATE_COLLECTION = 'view_state' as const;

export const DEFAULT_LOCAL_USER_ID = 'local' as const;

/**
 * Canonical document key for the `view_state` collection.
 *
 * Format: `${userId}:${projectId}:${class}` — matches Decision §3 verbatim.
 * Centralised here so the format cannot drift across the router, the hook,
 * and tests.
 */
export function viewStateDocumentKey(
  userId: string,
  projectId: string,
  className: ViewStateClass,
): string {
  return `${userId}:${projectId}:${className}`;
}
