import { z } from 'zod';
import {
  ProjectDiscoveryRequestSchema,
  ProjectDiscoveryResultSchema,
  ProjectIdSchema,
  ProjectKnowledgeRefreshRecordSchema,
  ProjectKnowledgeSnapshotSchema,
} from '@nous/shared';
import { publicProcedure, router } from '../trpc';

export const discoveryRouter = router({
  discover: publicProcedure
    .input(ProjectDiscoveryRequestSchema)
    .output(ProjectDiscoveryResultSchema)
    .query(async ({ ctx, input }) => {
      return ctx.knowledgeIndex.discoverProjects(input);
    }),

  snapshot: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .output(ProjectKnowledgeSnapshotSchema.nullable())
    .query(async ({ ctx, input }) => {
      return ctx.knowledgeIndex.getProjectSnapshot(input.projectId);
    }),

  refresh: publicProcedure
    .input(
      z.object({
        projectId: ProjectIdSchema,
        reasonCode: z.string().default('operator_manual_refresh'),
      }),
    )
    .output(ProjectKnowledgeRefreshRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.knowledgeIndex.refreshProjectKnowledge({
        projectId: input.projectId,
        trigger: 'manual',
        reasonCode: input.reasonCode,
        requestedAt: new Date().toISOString(),
      });
    }),
});
