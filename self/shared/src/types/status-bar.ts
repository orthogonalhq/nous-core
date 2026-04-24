/**
 * Status-bar aggregation contract for Nous-OSS.
 *
 * WR-162 — System Observability and Control.
 * Canonical source: status-bar-aggregation-contract-v1.md
 *
 * Per-slot schemas plus an aggregate StatusBarSnapshot. Each slot on the
 * aggregate is `.nullable()` — NOT `.optional()` — so the server-side
 * aggregator has a first-class "source failed or not yet available" signal
 * distinct from "malformed snapshot" (missing key).
 */
import { z } from 'zod';

export const StatusBarBackpressureSchema = z.object({
  state: z.enum(['nominal', 'elevated', 'critical']),
  queueDepth: z.number().int().nonnegative(),
  activeAgents: z.number().int().nonnegative(),
});
export type StatusBarBackpressure = z.infer<typeof StatusBarBackpressureSchema>;

export const StatusBarCognitiveProfileSchema = z.object({
  name: z.string(),
  profileId: z.string(),
});
export type StatusBarCognitiveProfile = z.infer<
  typeof StatusBarCognitiveProfileSchema
>;

export const StatusBarBudgetSchema = z.object({
  state: z.enum(['nominal', 'warning', 'caution', 'exceeded']),
  spent: z.number().nonnegative(),
  ceiling: z.number().nonnegative(),
  period: z.string(),
});
export type StatusBarBudget = z.infer<typeof StatusBarBudgetSchema>;

export const StatusBarActiveAgentsSchema = z.object({
  count: z.number().int().nonnegative(),
  status: z.enum(['idle', 'active']),
});
export type StatusBarActiveAgents = z.infer<typeof StatusBarActiveAgentsSchema>;

export const StatusBarSnapshotSchema = z.object({
  backpressure: StatusBarBackpressureSchema.nullable(),
  cognitiveProfile: StatusBarCognitiveProfileSchema.nullable(),
  budget: StatusBarBudgetSchema.nullable(),
  activeAgents: StatusBarActiveAgentsSchema.nullable(),
});
export type StatusBarSnapshot = z.infer<typeof StatusBarSnapshotSchema>;
