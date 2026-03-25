/**
 * Autonomic domain secondary types for Nous-OSS.
 *
 * Supports IDocumentStore, IVectorStore, IGraphStore, IRuntime, IHealthMonitor.
 */
import { z } from 'zod';

// --- Document Filter ---
export const DocumentFilterSchema = z.object({
  where: z.record(z.unknown()).optional(),
  orderBy: z.string().optional(),
  orderDirection: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().min(0).optional(),
});
export type DocumentFilter = z.infer<typeof DocumentFilterSchema>;

// --- Vector Filter ---
export const VectorFilterSchema = z.object({
  where: z.record(z.unknown()).optional(),
});
export type VectorFilter = z.infer<typeof VectorFilterSchema>;

// --- Vector Search Result ---
export const VectorSearchResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  metadata: z.record(z.unknown()),
});
export type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>;

// --- Graph Node ---
export const GraphNodeSchema = z.object({
  id: z.string(),
  labels: z.array(z.string()),
  properties: z.record(z.unknown()),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

// --- Platform Info ---
export const PlatformInfoSchema = z.object({
  os: z.enum(['darwin', 'linux', 'win32']),
  arch: z.string(),
  nodeVersion: z.string(),
});
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;

// --- Health Report ---
export const HealthReportSchema = z.object({
  healthy: z.boolean(),
  components: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      message: z.string().optional(),
    }),
  ),
  timestamp: z.string().datetime(),
});
export type HealthReport = z.infer<typeof HealthReportSchema>;

// --- System Metrics ---
export const SystemMetricsSchema = z.object({
  uptimeSeconds: z.number().min(0),
  memoryUsageMb: z.number().min(0),
  storageUsageMb: z.number().min(0),
  activeProjects: z.number().int().min(0),
  totalMemoryEntries: z.number().int().min(0),
});
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;

// --- Gateway Health Projections ---
// Lightweight projections of cortex-core gateway types, owned by @nous/shared.
// These decouple the autonomic layer from cortex-core schema maintenance.
// The DI wiring layer (sub-phase 1.2) maps the richer cortex-core types to these projections.

export const GatewayBootProjectionSchema = z.object({
  status: z.enum(['booting', 'ready', 'degraded']),
  completedSteps: z.array(z.string().min(1)),
  issueCodes: z.array(z.string().min(1)),
});
export type GatewayBootProjection = z.infer<typeof GatewayBootProjectionSchema>;

const BacklogAnalyticsProjectionSchema = z.object({
  queuedCount: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  completedInWindow: z.number().int().nonnegative(),
  failedInWindow: z.number().int().nonnegative(),
  pressureTrend: z.enum(['increasing', 'stable', 'decreasing']),
});

export const GatewayHealthProjectionSchema = z.object({
  agentClass: z.string().min(1),
  agentId: z.string().uuid(),
  visibleTools: z.array(z.string().min(1)),
  inboxReady: z.boolean(),
  lastAckAt: z.string().datetime().optional(),
  lastObservationAt: z.string().datetime().optional(),
  lastSubmissionAt: z.string().datetime().optional(),
  lastResultStatus: z.string().optional(),
  backlogAnalytics: BacklogAnalyticsProjectionSchema,
  issueCodes: z.array(z.string().min(1)),
  appSessions: z.array(z.object({
    sessionId: z.string().min(1),
    appId: z.string().min(1),
    packageId: z.string().min(1),
    projectId: z.string().uuid().optional(),
    status: z.enum(['starting', 'active', 'draining', 'stopped', 'failed']),
    healthStatus: z.enum(['healthy', 'degraded', 'unhealthy', 'stale']),
    startedAt: z.string().datetime(),
    lastHeartbeatAt: z.string().datetime().optional(),
    stale: z.boolean(),
  })),
});
export type GatewayHealthProjection = z.infer<typeof GatewayHealthProjectionSchema>;

export const SystemContextProjectionSchema = z.object({
  bootStatus: z.enum(['booting', 'ready', 'degraded']),
  inboxReady: z.boolean(),
  pendingSystemRuns: z.number().int().nonnegative(),
  backlogAnalytics: BacklogAnalyticsProjectionSchema,
  issueCodes: z.array(z.string().min(1)),
});
export type SystemContextProjection = z.infer<typeof SystemContextProjectionSchema>;

// --- Provider Health Snapshot ---

export const ProviderHealthEntrySchema = z.object({
  providerId: z.string().uuid(),
  name: z.string().min(1),
  type: z.string().min(1),
  isLocal: z.boolean(),
  endpoint: z.string().optional(),
  status: z.enum(['available', 'unknown', 'unreachable']),
  modelId: z.string().optional(),
});
export type ProviderHealthEntry = z.infer<typeof ProviderHealthEntrySchema>;

export const ProviderHealthSnapshotSchema = z.object({
  providers: z.array(ProviderHealthEntrySchema),
  collectedAt: z.string().datetime(),
});
export type ProviderHealthSnapshot = z.infer<typeof ProviderHealthSnapshotSchema>;

// --- Agent Status Snapshot ---

export const AgentGatewayEntrySchema = z.object({
  agentClass: z.string().min(1),
  agentId: z.string().uuid(),
  inboxReady: z.boolean(),
  visibleToolCount: z.number().int().nonnegative(),
  lastAckAt: z.string().datetime().optional(),
  lastObservationAt: z.string().datetime().optional(),
  lastSubmissionAt: z.string().datetime().optional(),
  lastResultStatus: z.string().optional(),
  issueCount: z.number().int().nonnegative(),
  issueCodes: z.array(z.string().min(1)),
});
export type AgentGatewayEntry = z.infer<typeof AgentGatewayEntrySchema>;

export const AgentStatusSnapshotSchema = z.object({
  gateways: z.array(AgentGatewayEntrySchema),
  appSessions: z.array(z.object({
    sessionId: z.string().min(1),
    appId: z.string().min(1),
    packageId: z.string().min(1),
    projectId: z.string().uuid().optional(),
    status: z.enum(['starting', 'active', 'draining', 'stopped', 'failed']),
    healthStatus: z.enum(['healthy', 'degraded', 'unhealthy', 'stale']),
    startedAt: z.string().datetime(),
    lastHeartbeatAt: z.string().datetime().optional(),
    stale: z.boolean(),
  })),
  collectedAt: z.string().datetime(),
  // Escalation audit summary (Phase 1.1 — WR-054)
  escalationCount: z.number().int().nonnegative().optional(),
  lastEscalationAt: z.string().datetime().optional(),
  lastEscalationSeverity: z.string().optional(),
});
export type AgentStatusSnapshot = z.infer<typeof AgentStatusSnapshotSchema>;

// --- System Status Snapshot ---

export const SystemStatusSnapshotSchema = z.object({
  bootStatus: z.enum(['booting', 'ready', 'degraded']),
  completedBootSteps: z.array(z.string().min(1)),
  issueCodes: z.array(z.string().min(1)),
  inboxReady: z.boolean(),
  pendingSystemRuns: z.number().int().nonnegative(),
  backlogAnalytics: z.object({
    queuedCount: z.number().int().nonnegative(),
    activeCount: z.number().int().nonnegative(),
    suspendedCount: z.number().int().nonnegative(),
    completedInWindow: z.number().int().nonnegative(),
    failedInWindow: z.number().int().nonnegative(),
    pressureTrend: z.enum(['increasing', 'stable', 'decreasing']),
  }),
  collectedAt: z.string().datetime(),
  // Escalation audit summary (Phase 1.1 — WR-054)
  escalationCount: z.number().int().nonnegative().optional(),
  lastEscalationAt: z.string().datetime().optional(),
  lastEscalationSeverity: z.string().optional(),
  // Checkpoint visibility (Phase 1.1 — WR-072)
  lastPreparedCheckpointId: z.string().optional(),
  lastCommittedCheckpointId: z.string().optional(),
  chainValid: z.boolean().optional(),
});
export type SystemStatusSnapshot = z.infer<typeof SystemStatusSnapshotSchema>;
