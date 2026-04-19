/**
 * View-state tRPC router — persistent cross-project UI state.
 *
 * Implements `viewState.get` / `viewState.set` per
 * `.architecture/.decisions/2026-04-18-project-model-and-settings/view-state-schema-v1.md`
 * §7 (binding). `userId` is derived from `ctx.userId` (server-ctx authority);
 * the input schemas structurally reject any client-supplied `userId` via
 * `.strict()`. Per-class payload validation happens at the Zod boundary via
 * the discriminated-union input schema.
 *
 * See `.worklog/sprints/feat/project-model-and-settings/phase-1/phase-1.2/sds.mdx`
 * §Data Model and §Failure Modes.
 */
import {
  VIEW_STATE_COLLECTION,
  ViewStateDocumentSchema,
  ViewStateGetInputSchema,
  ViewStateGetResultSchema,
  ViewStateSetInputSchema,
  ViewStateSetResultSchema,
  viewStateDocumentKey,
  type ViewStateDocument,
} from '@nous/shared';
import { router, publicProcedure } from '../trpc';

export const viewStateRouter = router({
  get: publicProcedure
    .input(ViewStateGetInputSchema)
    .output(ViewStateGetResultSchema)
    .query(async ({ ctx, input }) => {
      const id = viewStateDocumentKey(ctx.userId, input.projectId, input.class);
      const raw = await ctx.documentStore.get<unknown>(
        VIEW_STATE_COLLECTION,
        id,
      );

      if (raw === null || raw === undefined) {
        console.debug(
          `[view-state] get not-found class=${input.class} projectId=${input.projectId}`,
        );
        return null;
      }

      // Forward-compat: validate stored document against envelope schema. At
      // V1 the collection is new, so this path is not reachable — but future
      // schema evolutions or manual data tampering must not crash the client.
      const parsed = ViewStateDocumentSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          `[view-state] stored document rejected class=${input.class} projectId=${input.projectId} issues=${parsed.error.issues.length}`,
        );
        return null;
      }

      console.debug(
        `[view-state] get ok class=${input.class} projectId=${input.projectId}`,
      );

      return {
        payload: parsed.data.payload,
        updatedAt: parsed.data.updatedAt,
      };
    }),

  set: publicProcedure
    .input(ViewStateSetInputSchema)
    .output(ViewStateSetResultSchema)
    .mutation(async ({ ctx, input }) => {
      // Zod has already validated `input.payload` against the class-specific
      // schema via the discriminated union (SDS Invariant #4). We can safely
      // assemble the envelope and write it.
      const id = viewStateDocumentKey(ctx.userId, input.projectId, input.class);

      // Build the envelope by class to satisfy the discriminated-union shape.
      // Zod has narrowed `input` by `class`, but TypeScript's narrowing across
      // the router boundary is limited, so we branch explicitly.
      let document: ViewStateDocument;
      switch (input.class) {
        case 'layout':
          document = {
            userId: ctx.userId,
            projectId: input.projectId,
            class: 'layout',
            payload: input.payload,
            updatedAt: input.updatedAt,
          };
          break;
        case 'navigation':
          document = {
            userId: ctx.userId,
            projectId: input.projectId,
            class: 'navigation',
            payload: input.payload,
            updatedAt: input.updatedAt,
          };
          break;
        case 'focus':
          document = {
            userId: ctx.userId,
            projectId: input.projectId,
            class: 'focus',
            payload: input.payload,
            updatedAt: input.updatedAt,
          };
          break;
        case 'content':
          document = {
            userId: ctx.userId,
            projectId: input.projectId,
            class: 'content',
            payload: input.payload,
            updatedAt: input.updatedAt,
          };
          break;
      }

      await ctx.documentStore.put(VIEW_STATE_COLLECTION, id, document);

      console.debug(
        `[view-state] set ok class=${input.class} projectId=${input.projectId}`,
      );

      return { updatedAt: input.updatedAt };
    }),
});
