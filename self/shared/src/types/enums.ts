/**
 * Core enumerations for Nous-OSS.
 *
 * All enumerations use z.enum() producing string literal unions,
 * except PfcTier which is numeric (tiers are ordinal values compared with < / >).
 *
 * Each enum traces to a specific architecture doc.
 */
import { z } from 'zod';

// --- Cortex Tiers — from Cortex-mode-capability-matrix.mdx ---
// Numeric: tiers are fundamentally ordinal values (tier 0 < tier 5)
// and will be compared numerically in consuming code.
export const PfcTierSchema = z.number().int().min(0).max(5);
export type PfcTier = z.infer<typeof PfcTierSchema>;

// --- Model Roles — from phase-1.1 spec ---
export const ModelRoleSchema = z.enum([
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
]);
export type ModelRole = z.infer<typeof ModelRoleSchema>;

// --- Project Types — from project-model.mdx ---
export const ProjectTypeSchema = z.enum(['protocol', 'intent', 'hybrid']);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

// --- Governance Levels — from project-model.mdx ---
export const GovernanceLevelSchema = z.enum(['must', 'should', 'may']);
export type GovernanceLevel = z.infer<typeof GovernanceLevelSchema>;

// --- Memory Types — from memory-system.mdx ---
export const MemoryTypeSchema = z.enum([
  'fact',
  'preference',
  'experience-record',
  'distilled-pattern',
  'task-state',
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

// --- Memory Scope — from memory-system.mdx ---
export const MemoryScopeSchema = z.enum(['global', 'project']);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

// --- Sentiment Scale — from memory-system.mdx ---
export const SentimentSchema = z.enum([
  'strong-positive',
  'weak-positive',
  'neutral',
  'weak-negative',
  'strong-negative',
]);
export type Sentiment = z.infer<typeof SentimentSchema>;

// --- Node Types — from project-model.mdx ---
export const NodeTypeSchema = z.enum([
  'model-call',
  'tool-execution',
  'quality-gate',
  'human-decision',
  'condition',
  'transform',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// --- Execution Models — from project-model.mdx ---
export const ExecutionModelSchema = z.enum([
  'synchronous',
  'streaming',
  'async-batch',
  'scheduled',
]);
export type ExecutionModel = z.infer<typeof ExecutionModelSchema>;

// --- Provider Types — from project-model.mdx ---
export const ProviderTypeSchema = z.enum([
  'text',
  'image',
  'video',
  'vision',
  'embedding',
  'external-api',
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

// --- Escalation Channels — from project-model.mdx ---
export const EscalationChannelSchema = z.enum([
  'in-app',
  'push',
  'signal',
  'slack',
  'sms',
  'email',
  'voice',
]);
export type EscalationChannel = z.infer<typeof EscalationChannelSchema>;

// --- Package Types — from packages-and-plugins.mdx ---
export const PackageTypeSchema = z.enum(['skill', 'project', 'app', 'workflow']);
export type PackageType = z.infer<typeof PackageTypeSchema>;

// --- Retention Policy ---
export const RetentionPolicySchema = z.enum(['permanent', 'session', 'ttl']);
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

// --- Timeout Action ---
export const TimeoutActionSchema = z.enum(['halt', 'skip', 'fallback']);
export type TimeoutAction = z.infer<typeof TimeoutActionSchema>;

// --- Escalation Priority ---
export const EscalationPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type EscalationPriority = z.infer<typeof EscalationPrioritySchema>;

// --- Timeout Default Action ---
export const TimeoutDefaultActionSchema = z.enum(['proceed', 'halt', 'fallback']);
export type TimeoutDefaultAction = z.infer<typeof TimeoutDefaultActionSchema>;
