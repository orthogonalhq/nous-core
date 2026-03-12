import { randomUUID } from 'node:crypto';
import type {
  EndpointAuthorizationRequest,
  EndpointAuthorizationResult,
  EndpointCapabilityGrantInput,
  EndpointCapabilityGrantRecord,
  EndpointCapabilityRevocationInput,
  EndpointIncidentRecord,
  EndpointIncidentReportInput,
  EndpointPairingRecord,
  EndpointPairingRequestInput,
  EndpointPairingReviewInput,
  EndpointRegistrationInput,
  EndpointSessionRecord,
  EndpointSessionRotateInput,
  EndpointSessionStartInput,
  EndpointTransportValidationRequest,
  EndpointTransportValidationResult,
  EndpointTrustEndpoint,
  EndpointTrustPeripheral,
  EndpointTrustSurfaceSummary,
  IDocumentStore,
  IEndpointTrustService,
  IEscalationService,
  IOpctlService,
  IRegistryService,
  IWitnessService,
} from '@nous/shared';
import {
  EndpointAuthorizationRequestSchema,
  EndpointCapabilityGrantInputSchema,
  EndpointCapabilityRevocationInputSchema,
  EndpointIncidentReportInputSchema,
  EndpointPairingRequestInputSchema,
  EndpointPairingReviewInputSchema,
  EndpointRegistrationInputSchema,
  EndpointSessionRotateInputSchema,
  EndpointSessionStartInputSchema,
  EndpointTransportValidationRequestSchema,
} from '@nous/shared';
import { AuthorizationEngine } from './authorization-engine.js';
import { CapabilityStore } from './capability-store.js';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';
import { EndpointStore } from './endpoint-store.js';
import { IncidentOrchestrator } from './incident-orchestrator.js';
import { PairingStore } from './pairing-store.js';
import { SessionStore } from './session-store.js';
import { TransportValidator } from './transport-validator.js';

export interface EndpointTrustServiceOptions {
  documentStore?: IDocumentStore;
  endpointTrustStore?: DocumentEndpointTrustStore;
  pairingStore?: PairingStore;
  endpointStore?: EndpointStore;
  capabilityStore?: CapabilityStore;
  sessionStore?: SessionStore;
  transportValidator?: TransportValidator;
  authorizationEngine?: AuthorizationEngine;
  incidentOrchestrator?: IncidentOrchestrator;
  registryService?: IRegistryService;
  opctlService?: IOpctlService;
  escalationService?: IEscalationService;
  witnessService?: IWitnessService;
  now?: () => string;
  idFactory?: () => string;
}

export class EndpointTrustService implements IEndpointTrustService {
  private readonly store: DocumentEndpointTrustStore;
  private readonly pairingStore: PairingStore;
  private readonly endpointStore: EndpointStore;
  private readonly capabilityStore: CapabilityStore;
  private readonly sessionStore: SessionStore;
  private readonly transportValidator: TransportValidator;
  private readonly authorizationEngine: AuthorizationEngine;
  private readonly incidentOrchestrator: IncidentOrchestrator;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: EndpointTrustServiceOptions) {
    if (!options.endpointTrustStore && !options.documentStore) {
      throw new Error('EndpointTrustService requires documentStore or endpointTrustStore');
    }

    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.store = options.endpointTrustStore ?? new DocumentEndpointTrustStore(options.documentStore!);
    this.pairingStore = options.pairingStore ?? new PairingStore(this.store, {
      now: this.now,
      idFactory: this.idFactory,
    });
    this.endpointStore = options.endpointStore ?? new EndpointStore(this.store, {
      now: this.now,
      idFactory: this.idFactory,
    });
    this.capabilityStore = options.capabilityStore ?? new CapabilityStore(this.store, {
      now: this.now,
      idFactory: this.idFactory,
    });
    this.sessionStore = options.sessionStore ?? new SessionStore(this.store, {
      now: this.now,
      idFactory: this.idFactory,
    });
    this.transportValidator = options.transportValidator ?? new TransportValidator({
      now: this.now,
    });
    this.authorizationEngine = options.authorizationEngine ?? new AuthorizationEngine();
    this.incidentOrchestrator = options.incidentOrchestrator ?? new IncidentOrchestrator(
      this.store,
      {
        endpointStore: this.endpointStore,
        sessionStore: this.sessionStore,
        escalationService: options.escalationService,
        now: this.now,
        idFactory: this.idFactory,
      },
    );
  }

  async requestPairing(input: EndpointPairingRequestInput): Promise<EndpointPairingRecord> {
    const parsed = EndpointPairingRequestInputSchema.parse(input);
    const { pairing } = await this.pairingStore.createPairing(parsed);
    await this.recordWitness(`endpoint-trust:pairing:${pairing.pairing_id}`, 'succeeded', {
      pairingId: pairing.pairing_id,
      peripheralId: pairing.peripheral_id,
      status: pairing.status,
    }, pairing.project_id);
    return pairing;
  }

  async reviewPairing(input: EndpointPairingReviewInput): Promise<EndpointPairingRecord> {
    const parsed = EndpointPairingReviewInputSchema.parse(input);
    const { pairing } = await this.pairingStore.reviewPairing(parsed);
    await this.recordWitness(`endpoint-trust:pairing-review:${pairing.pairing_id}`, 'succeeded', {
      pairingId: pairing.pairing_id,
      status: pairing.status,
    }, pairing.project_id);
    return pairing;
  }

  async registerEndpoint(input: EndpointRegistrationInput): Promise<EndpointTrustEndpoint> {
    const parsed = EndpointRegistrationInputSchema.parse(input);
    const peripheral = await this.requirePeripheral(parsed.peripheral_id);
    const eligibility = await this.evaluateRegistryEligibility(
      parsed.project_id,
      parsed.connector_package_id ?? peripheral.connector_package_id,
      parsed.connector_release_id ?? peripheral.connector_release_id,
    );
    const endpoint = await this.endpointStore.register(parsed, peripheral, eligibility);
    await this.recordWitness(`endpoint-trust:endpoint:${endpoint.endpoint_id}`, 'succeeded', {
      endpointId: endpoint.endpoint_id,
      trustState: endpoint.trust_state,
      registryAllowed: eligibility == null || eligibility.block_reason_codes.length === 0,
    }, endpoint.project_id);
    return endpoint;
  }

  async grantCapability(
    input: EndpointCapabilityGrantInput,
  ): Promise<EndpointCapabilityGrantRecord> {
    const parsed = EndpointCapabilityGrantInputSchema.parse(input);
    const endpoint = await this.requireEndpoint(parsed.endpoint_id);
    if (endpoint.direction !== parsed.capability_class) {
      throw new Error('NDT-403-DIRECTION_CAPABILITY_MISMATCH');
    }
    if (endpoint.trust_state !== 'trusted') {
      throw new Error('NDT-402-ENDPOINT_NOT_TRUSTED');
    }

    const grant = await this.capabilityStore.grant(parsed);
    await this.recordWitness(`endpoint-trust:grant:${grant.grant_id}`, 'succeeded', {
      endpointId: grant.endpoint_id,
      capabilityKey: grant.capability_key,
    }, grant.project_id);
    return grant;
  }

  async revokeCapability(
    input: EndpointCapabilityRevocationInput,
  ): Promise<EndpointCapabilityGrantRecord> {
    const parsed = EndpointCapabilityRevocationInputSchema.parse(input);
    const grant = await this.capabilityStore.revoke(parsed);
    await this.recordWitness(`endpoint-trust:grant-revoke:${grant.grant_id}`, 'succeeded', {
      endpointId: grant.endpoint_id,
      capabilityKey: grant.capability_key,
      reasonCode: grant.reason_code,
    }, grant.project_id);
    return grant;
  }

  async establishSession(input: EndpointSessionStartInput): Promise<EndpointSessionRecord> {
    const parsed = EndpointSessionStartInputSchema.parse(input);
    const peripheral = await this.requirePeripheral(parsed.peripheral_id);
    const endpoint = await this.requireEndpoint(parsed.endpoint_id);
    if (peripheral.trust_state !== 'trusted' || endpoint.trust_state !== 'trusted') {
      throw new Error('NDT-402-ENDPOINT_NOT_TRUSTED');
    }

    const session = await this.sessionStore.start(parsed);
    await this.recordWitness(`endpoint-trust:session:${session.session_id}`, 'succeeded', {
      endpointId: session.endpoint_id,
      sessionId: session.session_id,
    }, session.project_id);
    return session;
  }

  async rotateSession(input: EndpointSessionRotateInput): Promise<EndpointSessionRecord> {
    const parsed = EndpointSessionRotateInputSchema.parse(input);
    const session = await this.sessionStore.rotate(parsed);
    await this.recordWitness(`endpoint-trust:session-rotate:${session.session_id}`, 'succeeded', {
      sessionId: session.session_id,
      status: session.status,
    }, session.project_id);
    return session;
  }

  async validateTransport(
    input: EndpointTransportValidationRequest,
  ): Promise<EndpointTransportValidationResult> {
    const parsed = EndpointTransportValidationRequestSchema.parse(input);
    const result = this.transportValidator.validate(parsed);
    if (result.decision === 'accepted' && parsed.session) {
      await this.sessionStore.touchAcceptedEnvelope(parsed.session, parsed.envelope);
    }
    await this.recordWitness(
      `endpoint-trust:transport:${parsed.envelope.envelope_id}`,
      result.decision === 'accepted' ? 'succeeded' : 'blocked',
      {
        envelopeId: parsed.envelope.envelope_id,
        reasonCode: result.reason_code,
      },
      parsed.envelope.project_id,
    );
    return result;
  }

  async authorize(
    input: EndpointAuthorizationRequest,
  ): Promise<EndpointAuthorizationResult> {
    const parsed = EndpointAuthorizationRequestSchema.parse({
      ...input,
      request_id: input.request_id ?? this.idFactory(),
      requested_at: input.requested_at ?? this.now(),
    });
    const peripheral = await this.getPeripheral(parsed.peripheral_id);
    const endpoint = await this.getEndpoint(parsed.endpoint_id);
    const grant = endpoint
      ? await this.capabilityStore.findActiveGrant(parsed.endpoint_id, parsed.capability_key)
      : null;
    const session = parsed.session_id
      ? await this.store.getSession(parsed.session_id)
      : null;
    const transportResult = parsed.transport_envelope && peripheral && endpoint
      ? await this.validateTransport({
          peripheral,
          endpoint,
          session,
          envelope: parsed.transport_envelope,
          observed_at: parsed.requested_at,
        })
      : undefined;
    const confirmationValidated = await this.validateConfirmation(parsed);
    const result = this.authorizationEngine.authorize({
      request: parsed,
      peripheral,
      endpoint,
      grant,
      session,
      transportResult,
      confirmationValidated,
      now: parsed.requested_at,
    });

    await this.recordWitness(
      `endpoint-trust:authorize:${result.request_id}`,
      result.decision === 'allowed' ? 'succeeded' : 'blocked',
      {
        requestId: result.request_id,
        endpointId: result.endpoint_id,
        reasonCode: result.reason_code,
      },
      result.project_id,
    );
    return result;
  }

  async reportIncident(input: EndpointIncidentReportInput): Promise<EndpointIncidentRecord> {
    const parsed = EndpointIncidentReportInputSchema.parse(input);
    const peripheral = await this.requirePeripheral(parsed.peripheral_id);
    const incident = await this.incidentOrchestrator.handle(parsed, peripheral);
    await this.recordWitness(`endpoint-trust:incident:${incident.incident_id}`, 'blocked', {
      incidentId: incident.incident_id,
      incidentType: incident.incident_type,
      reasonCode: incident.reason_code,
    }, incident.project_id);
    return incident;
  }

  async getPeripheral(peripheralId: string): Promise<EndpointTrustPeripheral | null> {
    return this.store.getPeripheral(peripheralId);
  }

  async getEndpoint(endpointId: string): Promise<EndpointTrustEndpoint | null> {
    return this.store.getEndpoint(endpointId);
  }

  async getProjectSurfaceSummary(
    projectId: EndpointTrustPeripheral['project_id'],
  ): Promise<EndpointTrustSurfaceSummary> {
    const [peripherals, endpoints, sessions, incidents] = await Promise.all([
      this.store.listPeripheralsByProject(projectId),
      this.store.listEndpointsByProject(projectId),
      this.store.listSessionsByProject(projectId),
      this.store.listIncidentsByProject(projectId),
    ]);

    const now = Date.parse(this.now());
    const expiringWindowMs = 24 * 60 * 60 * 1000;
    const latestIncident = incidents[0];

    return {
      projectId,
      peripheralCount: peripherals.length,
      trustedPeripheralCount: peripherals.filter((record) => record.trust_state === 'trusted').length,
      suspendedPeripheralCount: peripherals.filter((record) => record.trust_state === 'suspended').length,
      revokedPeripheralCount: peripherals.filter((record) => record.trust_state === 'revoked').length,
      sensoryEndpointCount: endpoints.filter((record) => record.direction === 'sensory').length,
      actionEndpointCount: endpoints.filter((record) => record.direction === 'action').length,
      activeSessionCount: sessions.filter((record) => record.status === 'active').length,
      expiringSessionCount: sessions.filter((record) => {
        if (record.status !== 'active' || !record.expires_at) {
          return false;
        }
        const expiresAt = Date.parse(record.expires_at);
        return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt - now <= expiringWindowMs;
      }).length,
      latestIncidentSeverity: latestIncident?.severity,
      latestIncidentReasonCode: latestIncident?.reason_code,
      registryBlockedEndpointCount: endpoints.filter(
        (record) => (record.registry_eligibility?.block_reason_codes.length ?? 0) > 0,
      ).length,
      diagnostics: {},
    };
  }

  private async requirePeripheral(peripheralId: string): Promise<EndpointTrustPeripheral> {
    const peripheral = await this.store.getPeripheral(peripheralId);
    if (!peripheral) {
      throw new Error(`Peripheral not found: ${peripheralId}`);
    }
    return peripheral;
  }

  private async requireEndpoint(endpointId: string): Promise<EndpointTrustEndpoint> {
    const endpoint = await this.store.getEndpoint(endpointId);
    if (!endpoint) {
      throw new Error(`Endpoint not found: ${endpointId}`);
    }
    return endpoint;
  }

  private async evaluateRegistryEligibility(
    projectId: EndpointRegistrationInput['project_id'],
    packageId?: string,
    releaseId?: string,
  ) {
    if (!this.options.registryService || !packageId || !releaseId) {
      return undefined;
    }
    return this.options.registryService.evaluateInstallEligibility({
      project_id: projectId,
      package_id: packageId,
      release_id: releaseId,
      principal_override_requested: false,
      principal_override_approved: false,
      evaluated_at: this.now(),
    });
  }

  private async validateConfirmation(
    request: EndpointAuthorizationRequest,
  ): Promise<boolean> {
    if (request.risk !== 'high') {
      return true;
    }
    if (
      !this.options.opctlService ||
      !request.confirmation_proof ||
      !request.control_command_envelope
    ) {
      return false;
    }
    return this.options.opctlService.validateConfirmationProof(
      request.confirmation_proof,
      request.control_command_envelope,
    );
  }

  private async recordWitness(
    actionRef: string,
    status: 'succeeded' | 'blocked',
    detail: Record<string, unknown>,
    projectId?: EndpointTrustPeripheral['project_id'],
  ): Promise<void> {
    if (!this.options.witnessService) {
      return;
    }

    const authorization = await this.options.witnessService.appendAuthorization({
      actionCategory: 'trace-persist',
      actionRef,
      projectId,
      actor: 'subcortex',
      status: 'approved',
      detail,
    });
    await this.options.witnessService.appendCompletion({
      actionCategory: 'trace-persist',
      actionRef,
      authorizationRef: authorization.id,
      projectId,
      actor: 'subcortex',
      status,
      detail,
    });
  }
}
