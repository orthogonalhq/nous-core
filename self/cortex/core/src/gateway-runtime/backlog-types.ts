import { z } from 'zod';

export const BacklogSubmissionSourceSchema = z.enum([
  'principal_tool',
  'scheduler',
  'system_event',
  'hook',
]);
export type BacklogSubmissionSource = z.infer<typeof BacklogSubmissionSourceSchema>;

export const BacklogPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical',
]);
export type BacklogPriority = z.infer<typeof BacklogPrioritySchema>;

export const BacklogEntryStatusSchema = z.enum([
  'queued',
  'active',
  'suspended',
  'completed',
  'failed',
]);
export type BacklogEntryStatus = z.infer<typeof BacklogEntryStatusSchema>;

export const BacklogResultStatusSchema = z.enum([
  'completed',
  'escalated',
  'aborted',
  'budget_exhausted',
  'error',
  'suspended',
]);
export type BacklogResultStatus = z.infer<typeof BacklogResultStatusSchema>;

export const BacklogPressureTrendSchema = z.enum([
  'idle',
  'steady',
  'rising',
  'degrading',
]);
export type BacklogPressureTrend = z.infer<typeof BacklogPressureTrendSchema>;

export const BacklogSuspensionDetailSchema = z.record(z.unknown());
export type BacklogSuspensionDetail = z.infer<typeof BacklogSuspensionDetailSchema>;

export const BacklogEntrySchema = z
  .object({
    id: z.string().min(1),
    status: BacklogEntryStatusSchema,
    source: BacklogSubmissionSourceSchema,
    priority: BacklogPrioritySchema,
    priorityRank: z.number().int().nonnegative(),
    instructions: z.string().min(1),
    payload: z.record(z.unknown()),
    projectId: z.string().uuid().optional(),
    dispatchRef: z.string().min(1),
    runId: z.string().min(1),
    acceptedAt: z.string().datetime(),
    promotedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    queueDepthAtAcceptance: z.number().int().nonnegative(),
    resultStatus: BacklogResultStatusSchema.optional(),
    lastErrorCode: z.string().min(1).optional(),
    lastErrorMessage: z.string().min(1).optional(),
    suspensionDetail: BacklogSuspensionDetailSchema.optional(),
  })
  .strict();
export type BacklogEntry = z.infer<typeof BacklogEntrySchema>;

export const BacklogQueueConfigSchema = z
  .object({
    activeCapacity: z.number().int().positive().default(1),
    analyticsWindowMs: z.number().int().positive().default(3_600_000),
    retentionWindowMs: z.number().int().positive().default(604_800_000),
  })
  .strict();
export type BacklogQueueConfig = z.infer<typeof BacklogQueueConfigSchema>;

export const BacklogAnalyticsSchema = z
  .object({
    queuedCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    suspendedCount: z.number().int().nonnegative(),
    activeCapacity: z.number().int().positive(),
    windowStart: z.string().datetime(),
    windowEnd: z.string().datetime(),
    completedInWindow: z.number().int().nonnegative(),
    failedInWindow: z.number().int().nonnegative(),
    avgWaitMs: z.number().nonnegative(),
    avgExecutionMs: z.number().nonnegative(),
    p95WaitMs: z.number().nonnegative(),
    peakQueueDepth: z.number().int().nonnegative(),
    pressureTrend: BacklogPressureTrendSchema,
  })
  .strict();
export type BacklogAnalytics = z.infer<typeof BacklogAnalyticsSchema>;

export const BACKLOG_PRIORITY_RANK: Record<BacklogPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

export const GATEWAY_RUNTIME_BACKLOG_COLLECTION = 'gateway_runtime_backlog_entries';

export function toBacklogPriorityRank(priority: BacklogPriority): number {
  return BACKLOG_PRIORITY_RANK[priority];
}

export function compareBacklogEntries(left: BacklogEntry, right: BacklogEntry): number {
  if (left.priorityRank !== right.priorityRank) {
    return right.priorityRank - left.priorityRank;
  }
  return left.acceptedAt.localeCompare(right.acceptedAt);
}
