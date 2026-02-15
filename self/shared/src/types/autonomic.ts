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
