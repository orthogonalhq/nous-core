import { z } from 'zod';
import { MobileOperationsSnapshotSchema, ProjectEscalationQueueSnapshotSchema, ProjectIdSchema } from '@nous/shared';
import { publicProcedure, router } from '../trpc';
import { buildProjectDashboardSnapshot, getProjectOrThrow } from './projects';

function buildQueueSnapshot(items: Awaited<ReturnType<import('../../context').NousContext['escalationService']['listProjectQueue']>>, projectId: string) {
  const openCount = items.filter((item) =>
    ['queued', 'visible', 'delivery_degraded'].includes(item.status),
  ).length;
  const acknowledgedCount = items.filter(
    (item) => item.status === 'acknowledged' || item.status === 'resolved',
  ).length;
  const urgentCount = items.filter((item) =>
    ['high', 'critical'].includes(item.severity),
  ).length;

  return ProjectEscalationQueueSnapshotSchema.parse({
    projectId,
    items,
    openCount,
    acknowledgedCount,
    urgentCount,
  });
}

function isVoiceProjectionNotFound(error: unknown): boolean {
  return error instanceof Error && /Voice session projection not found/i.test(error.message);
}

function isTrustSummaryEmpty(summary: Awaited<ReturnType<import('../../context').NousContext['endpointTrustService']['getProjectSurfaceSummary']>>) {
  return (
    summary.peripheralCount === 0 &&
    summary.sensoryEndpointCount === 0 &&
    summary.actionEndpointCount === 0 &&
    summary.activeSessionCount === 0 &&
    summary.latestIncidentSeverity == null
  );
}

export const mobileRouter = router({
  operationsSnapshot: publicProcedure
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectOrThrow(ctx, input.projectId);
      const [dashboard, queueItems] = await Promise.all([
        buildProjectDashboardSnapshot(ctx, project),
        ctx.escalationService.listProjectQueue(project.id),
      ]);

      const escalationQueue = buildQueueSnapshot(queueItems, project.id);
      let degradedReasonCode = dashboard.diagnostics.degradedReasonCode;
      let voiceSession = null;
      let endpointTrust = null;

      try {
        voiceSession = await ctx.voiceControlService.getSessionProjection({
          project_id: project.id,
        });
      } catch (error) {
        if (!isVoiceProjectionNotFound(error)) {
          degradedReasonCode ??= 'voice_projection_unavailable';
        }
      }

      try {
        const summary = await ctx.endpointTrustService.getProjectSurfaceSummary(project.id);
        endpointTrust = isTrustSummaryEmpty(summary) ? null : summary;
      } catch {
        degradedReasonCode ??= 'endpoint_trust_summary_unavailable';
      }

      return MobileOperationsSnapshotSchema.parse({
        project: {
          id: project.id,
          name: project.name,
          type: project.type,
        },
        dashboard,
        escalationQueue,
        voiceSession,
        endpointTrust,
        diagnostics: {
          runtimePosture: 'single_process_local',
          degradedReasonCode,
        },
        generatedAt: new Date().toISOString(),
      });
    }),
});
