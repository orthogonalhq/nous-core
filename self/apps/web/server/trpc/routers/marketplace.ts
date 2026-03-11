import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  MarketplaceModerationDashboardRequestSchema,
  MarketplaceModerationDashboardSnapshotSchema,
  MarketplaceNudgeFeedbackInputSchema,
  MarketplaceNudgeFeedRequestSchema,
  MarketplaceNudgeFeedSnapshotSchema,
  NudgeAcceptanceRouteResultSchema,
  NudgeAcceptanceRouteRequestSchema,
  NudgeFeedbackRecordSchema,
  NudgeSuppressionMutationInputSchema,
  NudgeSuppressionRecordSchema,
  RegistryBrowseRequestSchema,
  RegistryBrowseResultSchema,
  RegistryPackageDetailSnapshotSchema,
  ProjectIdSchema,
} from '@nous/shared';
import { publicProcedure, router } from '../trpc';

function buildDetailLinks(input: {
  packageId: string;
  projectId?: string;
  releaseId?: string;
}) {
  const links: Array<{
    target: 'artifact' | 'projects' | 'mao';
    packageId: string;
    projectId?: any;
    releaseId?: string;
  }> = [
    {
      target: 'artifact' as const,
      packageId: input.packageId,
      projectId: input.projectId as any,
      releaseId: input.releaseId,
    },
  ];

  if (input.projectId) {
    links.push({
      target: 'projects' as const,
      packageId: input.packageId,
      projectId: input.projectId as any,
      releaseId: input.releaseId,
    });
    links.push({
      target: 'mao' as const,
      packageId: input.packageId,
      projectId: input.projectId as any,
      releaseId: input.releaseId,
    });
  }

  return links;
}

function extractEscalationIds(...refs: Array<readonly string[] | undefined>) {
  return [...new Set(
    refs.flatMap((collection) =>
      (collection ?? [])
        .filter((ref) => ref.startsWith('escalation:'))
        .map((ref) => ref.slice('escalation:'.length) as any),
    ),
  )];
}

export const marketplaceRouter = router({
  browsePackages: publicProcedure
    .input(RegistryBrowseRequestSchema)
    .output(RegistryBrowseResultSchema)
    .query(async ({ ctx, input }) => {
      return ctx.registryService.listPackages(input);
    }),

  getPackageDetail: publicProcedure
    .input(
      z.object({
        packageId: z.string().min(1),
        projectId: ProjectIdSchema.optional(),
      }),
    )
    .output(RegistryPackageDetailSnapshotSchema)
    .query(async ({ ctx, input }) => {
      const packageRecord = await ctx.registryService.getPackage(input.packageId);
      if (!packageRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Registry package not found: ${input.packageId}`,
        });
      }

      const releases = await ctx.registryService.listReleases(input.packageId);
      const latestRelease =
        packageRecord.latest_release_id != null
          ? await ctx.registryService.getRelease(packageRecord.latest_release_id)
          : releases[0] ?? null;
      const maintainers = await ctx.registryService.getPackageMaintainers(
        input.packageId,
      );
      const governanceTimeline = (
        await ctx.registryService.listGovernanceActions({
          packageId: input.packageId,
          actionTypes: [],
          limit: 50,
        })
      ).actions;
      const appeals = (
        await ctx.registryService.listAppeals({
          packageId: input.packageId,
          statuses: [],
          includeResolved: true,
          limit: 50,
        })
      ).appeals;
      const trustEligibility =
        input.projectId && latestRelease
          ? await ctx.registryService.evaluateInstallEligibility({
              project_id: input.projectId,
              package_id: input.packageId,
              release_id: latestRelease.release_id,
              principal_override_requested: false,
              principal_override_approved: false,
            })
          : null;

      return {
        package: packageRecord,
        latestRelease,
        releases,
        maintainers,
        governanceTimeline,
        appeals,
        trustEligibility,
        deepLinks: buildDetailLinks({
          packageId: input.packageId,
          projectId: input.projectId,
          releaseId: latestRelease?.release_id,
        }),
        generatedAt: new Date().toISOString(),
      };
    }),

  getModerationDashboard: publicProcedure
    .input(MarketplaceModerationDashboardRequestSchema)
    .output(MarketplaceModerationDashboardSnapshotSchema)
    .query(async ({ ctx, input }) => {
      const browse = await ctx.registryService.listPackages({
        query: input.query,
        trustTiers: [],
        distributionStatuses: [],
        compatibilityStates: [],
        page: 1,
        pageSize: 50,
      });

      const rows = [];
      for (const item of browse.items) {
        const latestGovernanceAction = (
          await ctx.registryService.listGovernanceActions({
            packageId: item.package.package_id,
            actionTypes: [],
            limit: 1,
          })
        ).actions[0] ?? null;
        const latestAppeal = (
          await ctx.registryService.listAppeals({
            packageId: item.package.package_id,
            statuses: [],
            includeResolved: input.includeResolvedAppeals,
            limit: 1,
          })
        ).appeals[0] ?? null;

        if (
          input.statuses.length > 0 &&
          (!item.package.moderation_state ||
            !input.statuses.includes(item.package.moderation_state))
        ) {
          continue;
        }
        if (
          !item.package.moderation_state &&
          item.package.distribution_status === 'active' &&
          !latestAppeal
        ) {
          continue;
        }

        rows.push({
          package: item.package,
          latestRelease: item.latestRelease,
          latestGovernanceAction,
          latestAppeal,
          escalationIds: extractEscalationIds(
            item.package.evidence_refs,
            latestGovernanceAction?.evidence_refs,
            latestAppeal?.submitted_evidence_refs,
          ),
          deepLinks: item.deepLinks,
        });
      }

      return {
        rows,
        pendingAppealCount: rows.filter(
          (row) => row.latestAppeal?.status === 'submitted' || row.latestAppeal?.status === 'under_review',
        ).length,
        activeHoldCount: rows.filter(
          (row) => row.package.moderation_state === 'distribution_hold',
        ).length,
        delistedCount: rows.filter(
          (row) =>
            row.package.distribution_status === 'delisted' ||
            row.package.moderation_state === 'delisted',
        ).length,
        generatedAt: new Date().toISOString(),
      };
    }),

  getDiscoveryFeed: publicProcedure
    .input(MarketplaceNudgeFeedRequestSchema)
    .output(MarketplaceNudgeFeedSnapshotSchema)
    .query(async ({ ctx, input }) => {
      return ctx.nudgeDiscoveryService.prepareSurfaceFeed(input);
    }),

  applyNudgeSuppression: publicProcedure
    .input(NudgeSuppressionMutationInputSchema)
    .output(NudgeSuppressionRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.nudgeDiscoveryService.applySuppression(input);
    }),

  recordNudgeFeedback: publicProcedure
    .input(MarketplaceNudgeFeedbackInputSchema)
    .output(NudgeFeedbackRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.nudgeDiscoveryService.recordFeedback({
        candidate_id: input.candidateId,
        decision_id: input.decisionId,
        delivery_id: input.deliveryId,
        event_type: input.eventType,
        surface: input.surface,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        evidence_refs: input.evidenceRefs,
      });
    }),

  routeNudgeAcceptance: publicProcedure
    .input(NudgeAcceptanceRouteRequestSchema)
    .output(NudgeAcceptanceRouteResultSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.nudgeDiscoveryService.recordFeedback({
        candidate_id: input.candidate_id,
        decision_id: input.decision_id,
        event_type: 'accepted',
        surface: 'discovery_card',
        occurred_at: input.accepted_at,
        evidence_refs: input.evidence_refs,
      });
      return ctx.nudgeDiscoveryService.routeAcceptance(input);
    }),
});
