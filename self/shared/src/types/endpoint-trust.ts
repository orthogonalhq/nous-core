import { z } from 'zod';
import {
  ConfirmationProofSchema,
  ControlCommandEnvelopeSchema,
} from './opctl.js';
import {
  ProjectIdSchema,
  TraceIdSchema,
} from './ids.js';
import { RegistryInstallEligibilitySnapshotSchema } from './registry.js';

export const EndpointTrustReasonCodeSchema = z
  .string()
  .regex(/^NDT-\d{3}-[A-Z0-9][A-Z0-9_-]*$/);
export type EndpointTrustReasonCode = z.infer<typeof EndpointTrustReasonCodeSchema>;

export const EndpointTrustStateSchema = z.enum([
  'pending',
  'trusted',
  'suspended',
  'revoked',
  'denied',
]);
export type EndpointTrustState = z.infer<typeof EndpointTrustStateSchema>;

export const EndpointDirectionSchema = z.enum(['sensory', 'action']);
export type EndpointDirection = z.infer<typeof EndpointDirectionSchema>;

export const EndpointCapabilityClassSchema = z.enum(['sensory', 'action']);
export type EndpointCapabilityClass = z.infer<typeof EndpointCapabilityClassSchema>;

export const EndpointPairingStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
  'expired',
  'cancelled',
]);
export type EndpointPairingStatus = z.infer<typeof EndpointPairingStatusSchema>;

export const EndpointCapabilityGrantStatusSchema = z.enum([
  'active',
  'revoked',
  'expired',
]);
export type EndpointCapabilityGrantStatus = z.infer<
  typeof EndpointCapabilityGrantStatusSchema
>;

export const EndpointSessionStatusSchema = z.enum([
  'active',
  'rotated',
  'revoked',
  'expired',
]);
export type EndpointSessionStatus = z.infer<typeof EndpointSessionStatusSchema>;

export const EndpointTransportDecisionSchema = z.enum(['accepted', 'blocked']);
export type EndpointTransportDecision = z.infer<typeof EndpointTransportDecisionSchema>;

export const EndpointAuthorizationDecisionSchema = z.enum(['allowed', 'blocked']);
export type EndpointAuthorizationDecision = z.infer<
  typeof EndpointAuthorizationDecisionSchema
>;

export const EndpointAuthorizationRiskSchema = z.enum(['standard', 'high']);
export type EndpointAuthorizationRisk = z.infer<
  typeof EndpointAuthorizationRiskSchema
>;

export const EndpointIncidentTypeSchema = z.enum([
  'lost_device',
  'compromised_device',
  'mitm_detected',
  'manual_suspend',
  'manual_revoke',
]);
export type EndpointIncidentType = z.infer<typeof EndpointIncidentTypeSchema>;

export const EndpointIncidentSeveritySchema = z.enum([
  'medium',
  'high',
  'critical',
]);
export type EndpointIncidentSeverity = z.infer<typeof EndpointIncidentSeveritySchema>;

export const EndpointIncidentActionSchema = z.enum([
  'none',
  'suspend_peripheral',
  'revoke_peripheral',
  'suspend_endpoints',
  'revoke_endpoints',
  'revoke_sessions',
  'escalate',
]);
export type EndpointIncidentAction = z.infer<typeof EndpointIncidentActionSchema>;

export const EndpointTrustPeripheralSchema = z.object({
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  display_name: z.string().min(1),
  principal_id: z.string().min(1),
  trust_state: EndpointTrustStateSchema,
  connector_package_id: z.string().min(1).optional(),
  connector_release_id: z.string().min(1).optional(),
  registry_eligibility: RegistryInstallEligibilitySnapshotSchema.optional(),
  paired_at: z.string().datetime().optional(),
  last_seen_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
  evidence_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type EndpointTrustPeripheral = z.infer<typeof EndpointTrustPeripheralSchema>;

export const EndpointPairingRequestInputSchema = z.object({
  pairing_id: z.string().uuid().optional(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  display_name: z.string().min(1),
  principal_id: z.string().min(1),
  connector_package_id: z.string().min(1).optional(),
  connector_release_id: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  requested_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type EndpointPairingRequestInput = z.infer<
  typeof EndpointPairingRequestInputSchema
>;

export const EndpointPairingRecordSchema = z.object({
  pairing_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  principal_id: z.string().min(1),
  status: EndpointPairingStatusSchema,
  approval_evidence_ref: z.string().min(1).optional(),
  denial_reason_code: EndpointTrustReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  requested_at: z.string().datetime(),
  reviewed_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type EndpointPairingRecord = z.infer<typeof EndpointPairingRecordSchema>;

export const EndpointPairingReviewInputSchema = z.object({
  pairing_id: z.string().uuid(),
  approved: z.boolean(),
  reviewed_by: z.string().min(1),
  approval_evidence_ref: z.string().min(1).optional(),
  denial_reason_code: EndpointTrustReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  reviewed_at: z.string().datetime().optional(),
});
export type EndpointPairingReviewInput = z.infer<
  typeof EndpointPairingReviewInputSchema
>;

export const EndpointRegistrationInputSchema = z.object({
  endpoint_id: z.string().uuid().optional(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  display_name: z.string().min(1),
  direction: EndpointDirectionSchema,
  capability_keys: z.array(z.string().min(1)).min(1),
  connector_package_id: z.string().min(1).optional(),
  connector_release_id: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
  registered_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type EndpointRegistrationInput = z.infer<typeof EndpointRegistrationInputSchema>;

export const EndpointTrustEndpointSchema = z.object({
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  display_name: z.string().min(1),
  direction: EndpointDirectionSchema,
  capability_keys: z.array(z.string().min(1)).min(1),
  trust_state: EndpointTrustStateSchema,
  connector_package_id: z.string().min(1).optional(),
  connector_release_id: z.string().min(1).optional(),
  registry_eligibility: RegistryInstallEligibilitySnapshotSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  evidence_refs: z.array(z.string().min(1)).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type EndpointTrustEndpoint = z.infer<typeof EndpointTrustEndpointSchema>;

export const EndpointCapabilityGrantInputSchema = z.object({
  grant_id: z.string().uuid().optional(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  capability_key: z.string().min(1),
  capability_class: EndpointCapabilityClassSchema,
  policy_ref: z.string().min(1),
  granted_by: z.string().min(1),
  reason_code: EndpointTrustReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  granted_at: z.string().datetime().optional(),
});
export type EndpointCapabilityGrantInput = z.infer<
  typeof EndpointCapabilityGrantInputSchema
>;

export const EndpointCapabilityGrantRecordSchema = z.object({
  grant_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  capability_key: z.string().min(1),
  capability_class: EndpointCapabilityClassSchema,
  policy_ref: z.string().min(1),
  granted_by: z.string().min(1),
  status: EndpointCapabilityGrantStatusSchema,
  reason_code: EndpointTrustReasonCodeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  granted_at: z.string().datetime(),
  revoked_at: z.string().datetime().optional(),
});
export type EndpointCapabilityGrantRecord = z.infer<
  typeof EndpointCapabilityGrantRecordSchema
>;

export const EndpointCapabilityRevocationInputSchema = z.object({
  grant_id: z.string().uuid(),
  revoked_by: z.string().min(1),
  reason_code: EndpointTrustReasonCodeSchema,
  evidence_refs: z.array(z.string().min(1)).default([]),
  revoked_at: z.string().datetime().optional(),
});
export type EndpointCapabilityRevocationInput = z.infer<
  typeof EndpointCapabilityRevocationInputSchema
>;

export const EndpointSessionStartInputSchema = z.object({
  session_id: z.string().uuid().optional(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  established_by: z.string().min(1),
  expires_at: z.string().datetime().optional(),
  established_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type EndpointSessionStartInput = z.infer<typeof EndpointSessionStartInputSchema>;

export const EndpointSessionRotateInputSchema = z.object({
  session_id: z.string().uuid(),
  rotated_by: z.string().min(1),
  rotated_at: z.string().datetime().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
});
export type EndpointSessionRotateInput = z.infer<typeof EndpointSessionRotateInputSchema>;

export const EndpointSessionRecordSchema = z.object({
  session_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  status: EndpointSessionStatusSchema,
  established_by: z.string().min(1),
  last_nonce: z.string().uuid().optional(),
  last_sequence: z.number().int().nonnegative().default(0),
  evidence_refs: z.array(z.string().min(1)).default([]),
  established_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  rotated_at: z.string().datetime().optional(),
  revoked_at: z.string().datetime().optional(),
});
export type EndpointSessionRecord = z.infer<typeof EndpointSessionRecordSchema>;

export const EndpointTransportEnvelopeSchema = z.object({
  envelope_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  session_id: z.string().uuid(),
  nonce: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  trace_id: TraceIdSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type EndpointTransportEnvelope = z.infer<typeof EndpointTransportEnvelopeSchema>;

export const EndpointTransportValidationRequestSchema = z.object({
  peripheral: EndpointTrustPeripheralSchema,
  endpoint: EndpointTrustEndpointSchema,
  session: EndpointSessionRecordSchema.nullable(),
  envelope: EndpointTransportEnvelopeSchema,
  observed_at: z.string().datetime().optional(),
});
export type EndpointTransportValidationRequest = z.infer<
  typeof EndpointTransportValidationRequestSchema
>;

export const EndpointTransportValidationResultSchema = z.object({
  decision: EndpointTransportDecisionSchema,
  reason_code: EndpointTrustReasonCodeSchema.optional(),
  session_id: z.string().uuid().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  evaluated_at: z.string().datetime(),
});
export type EndpointTransportValidationResult = z.infer<
  typeof EndpointTransportValidationResultSchema
>;

export const EndpointAuthorizationRequestSchema = z.object({
  request_id: z.string().uuid().optional(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  capability_key: z.string().min(1),
  capability_class: EndpointCapabilityClassSchema,
  risk: EndpointAuthorizationRiskSchema.default('standard'),
  policy_ref: z.string().min(1),
  session_id: z.string().uuid().optional(),
  transport_envelope: EndpointTransportEnvelopeSchema.optional(),
  confirmation_proof: ConfirmationProofSchema.optional(),
  control_command_envelope: ControlCommandEnvelopeSchema.optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  requested_at: z.string().datetime().optional(),
});
export type EndpointAuthorizationRequest = z.infer<
  typeof EndpointAuthorizationRequestSchema
>;

export const EndpointAuthorizationResultSchema = z.object({
  decision: EndpointAuthorizationDecisionSchema,
  reason_code: EndpointTrustReasonCodeSchema.optional(),
  request_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  project_id: ProjectIdSchema,
  grant_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  evaluated_at: z.string().datetime(),
});
export type EndpointAuthorizationResult = z.infer<
  typeof EndpointAuthorizationResultSchema
>;

export const EndpointIncidentReportInputSchema = z.object({
  incident_id: z.string().uuid().optional(),
  peripheral_id: z.string().uuid(),
  endpoint_id: z.string().uuid().optional(),
  project_id: ProjectIdSchema,
  incident_type: EndpointIncidentTypeSchema,
  reported_by: z.string().min(1),
  severity: EndpointIncidentSeveritySchema.default('high'),
  reason_code: EndpointTrustReasonCodeSchema,
  evidence_refs: z.array(z.string().min(1)).default([]),
  reported_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type EndpointIncidentReportInput = z.infer<
  typeof EndpointIncidentReportInputSchema
>;

export const EndpointIncidentRecordSchema = z.object({
  incident_id: z.string().uuid(),
  peripheral_id: z.string().uuid(),
  endpoint_id: z.string().uuid().optional(),
  project_id: ProjectIdSchema,
  incident_type: EndpointIncidentTypeSchema,
  reported_by: z.string().min(1),
  severity: EndpointIncidentSeveritySchema,
  reason_code: EndpointTrustReasonCodeSchema,
  action_taken: z.array(EndpointIncidentActionSchema).min(1),
  escalation_id: z.string().uuid().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  reported_at: z.string().datetime(),
});
export type EndpointIncidentRecord = z.infer<typeof EndpointIncidentRecordSchema>;

export const EndpointTrustSurfaceSummarySchema = z.object({
  projectId: ProjectIdSchema,
  peripheralCount: z.number().int().min(0),
  trustedPeripheralCount: z.number().int().min(0),
  suspendedPeripheralCount: z.number().int().min(0),
  revokedPeripheralCount: z.number().int().min(0),
  sensoryEndpointCount: z.number().int().min(0),
  actionEndpointCount: z.number().int().min(0),
  activeSessionCount: z.number().int().min(0),
  expiringSessionCount: z.number().int().min(0),
  latestIncidentSeverity: EndpointIncidentSeveritySchema.optional(),
  latestIncidentReasonCode: EndpointTrustReasonCodeSchema.optional(),
  registryBlockedEndpointCount: z.number().int().min(0),
  diagnostics: z.object({
    degradedReasonCode: z.string().min(1).optional(),
  }),
});
export type EndpointTrustSurfaceSummary = z.infer<
  typeof EndpointTrustSurfaceSummarySchema
>;
