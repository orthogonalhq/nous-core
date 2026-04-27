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
export * from './event-bus/index.js';
export * from './types/app-credentials.js';
export {
  AppPanelLifecycleEventSchema,
  AppPanelLifecycleProjectionSchema,
  AppPanelLifecycleReasonSchema,
  AppPanelLifecycleUpdateSchema,
  AppPanelPersistedStateDeleteInputSchema,
  AppPanelPersistedStateGetInputSchema,
  AppPanelPersistedStateKeySchema,
  AppPanelPersistedStateResultSchema,
  AppPanelPersistedStateSetInputSchema,
  AppPanelPersistedStateValueSchema,
} from './types/app-runtime.js';
export type {
  AppPanelLifecycleEvent,
  AppPanelLifecycleProjection,
  AppPanelLifecycleReason,
  AppPanelLifecycleUpdate,
  AppPanelPersistedStateDeleteInput,
  AppPanelPersistedStateGetInput,
  AppPanelPersistedStateKey,
  AppPanelPersistedStateResult,
  AppPanelPersistedStateSetInput,
  AppPanelPersistedStateValue,
} from './types/app-runtime.js';
export type { GatewayExecutionContext } from './types/agent-gateway.js';
export type {
  IAppCredentialInstallService,
  ICredentialInjector,
  ICredentialVaultService,
} from './interfaces/index.js';
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
export type { IPublicMcpGatewayService } from './interfaces/subcortex.js';
export type { IVoiceControlService } from './interfaces/subcortex.js';
export type { EndpointTrustSurfaceSummary } from './types/endpoint-trust.js';
export {
  FIRST_RUN_STEP_VALUES,
  FirstRunStepSchema,
  FirstRunCurrentStepSchema,
  FirstRunStepStatusSchema,
  FirstRunStepStateSchema,
  FirstRunStateSchema,
  buildFirstRunStateStepsSchema,
  defineWizardStep,
  deriveFirstRunStepValues,
  deriveFirstRunStateSchema,
  deriveBackendStepToWizardStep,
  derivePreviousStepMap,
  deriveWizardStepIds,
  validateWizardRegistry,
  assertRegistryMatchesManifest,
  WizardRegistryInvariantError,
} from './wizard-registry.js';
export type {
  FirstRunStep,
  FirstRunCurrentStep,
  FirstRunStepStatus,
  FirstRunStepState,
  FirstRunState,
  WizardStepDefinition,
  WizardRegistryInvariantCode,
} from './wizard-registry.js';
