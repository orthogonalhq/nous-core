/**
 * Branded ID types for Nous-OSS.
 *
 * Branded types prevent accidental mixing of different ID types.
 * At runtime these are plain UUID strings; at compile time TypeScript
 * treats them as structurally distinct.
 */
import { z } from 'zod';

const brandedId = <T extends string>(brand: T) =>
  z.string().uuid().brand(brand);

// --- Primary Entity IDs ---

export const ProjectIdSchema = brandedId('ProjectId');
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const MemoryEntryIdSchema = brandedId('MemoryEntryId');
export type MemoryEntryId = z.infer<typeof MemoryEntryIdSchema>;

export const NodeIdSchema = brandedId('NodeId');
export type NodeId = z.infer<typeof NodeIdSchema>;

export const TraceIdSchema = brandedId('TraceId');
export type TraceId = z.infer<typeof TraceIdSchema>;

export const ArtifactIdSchema = brandedId('ArtifactId');
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;

export const ProviderIdSchema = brandedId('ProviderId');
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const WorkflowExecutionIdSchema = brandedId('WorkflowExecutionId');
export type WorkflowExecutionId = z.infer<typeof WorkflowExecutionIdSchema>;

export const EscalationIdSchema = brandedId('EscalationId');
export type EscalationId = z.infer<typeof EscalationIdSchema>;

export const WitnessEventIdSchema = brandedId('WitnessEventId');
export type WitnessEventId = z.infer<typeof WitnessEventIdSchema>;

export const WitnessCheckpointIdSchema = brandedId('WitnessCheckpointId');
export type WitnessCheckpointId = z.infer<typeof WitnessCheckpointIdSchema>;

export const VerificationReportIdSchema = brandedId('VerificationReportId');
export type VerificationReportId = z.infer<typeof VerificationReportIdSchema>;

export const AttestationReceiptIdSchema = brandedId('AttestationReceiptId');
export type AttestationReceiptId = z.infer<typeof AttestationReceiptIdSchema>;

export const MemoryMutationIdSchema = brandedId('MemoryMutationId');
export type MemoryMutationId = z.infer<typeof MemoryMutationIdSchema>;

export const MemoryTombstoneIdSchema = brandedId('MemoryTombstoneId');
export type MemoryTombstoneId = z.infer<typeof MemoryTombstoneIdSchema>;

export const ControlCommandIdSchema = brandedId('ControlCommandId');
export type ControlCommandId = z.infer<typeof ControlCommandIdSchema>;

export const LeaseIdSchema = brandedId('LeaseId');
export type LeaseId = z.infer<typeof LeaseIdSchema>;
