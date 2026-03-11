/**
 * @nous/shared — Cross-layer nervous system for Nous-OSS.
 *
 * Contains type definitions, interface contracts, event schemas, and error types.
 * No execution logic. No business logic. No I/O.
 */
export * from './types/index.js';
export * from './interfaces/index.js';
export * from './events/index.js';
export * from './errors/index.js';
export type {
  ChannelIngressEnvelope,
  ChannelEgressEnvelope,
  CommunicationIdentityBindingUpsertInput,
  CommunicationIdentityBindingRecord,
  CommunicationApprovalIntakeRecord,
  CommunicationEscalationAcknowledgementInput,
  CommunicationIngressOutcome,
  CommunicationEgressOutcome,
  CommunicationRouteDecision,
} from './types/communication-gateway.js';
export type { ICommunicationGatewayService } from './interfaces/subcortex.js';
