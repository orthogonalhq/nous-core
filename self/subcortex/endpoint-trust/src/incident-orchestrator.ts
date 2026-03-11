import { randomUUID } from 'node:crypto';
import type {
  EndpointIncidentRecord,
  EndpointIncidentReportInput,
  EndpointTrustPeripheral,
  IEscalationService,
} from '@nous/shared';
import { EndpointIncidentRecordSchema, EndpointTrustPeripheralSchema } from '@nous/shared';
import { DocumentEndpointTrustStore } from './document-endpoint-trust-store.js';
import { EndpointStore } from './endpoint-store.js';
import { SessionStore } from './session-store.js';

export interface IncidentOrchestratorOptions {
  endpointStore: EndpointStore;
  sessionStore: SessionStore;
  escalationService?: IEscalationService;
  now?: () => string;
  idFactory?: () => string;
}

export class IncidentOrchestrator {
  private readonly now: () => string;

  constructor(
    private readonly store: DocumentEndpointTrustStore,
    private readonly options: IncidentOrchestratorOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async handle(
    input: EndpointIncidentReportInput,
    peripheral: EndpointTrustPeripheral,
  ): Promise<EndpointIncidentRecord> {
    const reportedAt = input.reported_at ?? this.now();
    const severe = input.incident_type === 'compromised_device' ||
      input.incident_type === 'mitm_detected' ||
      input.incident_type === 'manual_revoke';
    const peripheralTrustState = severe ? 'revoked' : 'suspended';
    const endpointTrustState = severe ? 'revoked' : 'suspended';
    const actionTaken = severe
      ? ['revoke_peripheral', 'revoke_endpoints', 'revoke_sessions', 'escalate']
      : ['suspend_peripheral', 'suspend_endpoints', 'revoke_sessions', 'escalate'];
    const evidenceRefs = [...new Set([...input.evidence_refs, `reason:${input.reason_code}`])];

    const nextPeripheral = EndpointTrustPeripheralSchema.parse({
      ...peripheral,
      trust_state: peripheralTrustState,
      updated_at: reportedAt,
      evidence_refs: [...new Set([...peripheral.evidence_refs, ...evidenceRefs])],
    });

    await this.store.savePeripheral(nextPeripheral);
    await this.options.endpointStore.setTrustStateForPeripheral(
      peripheral.peripheral_id,
      endpointTrustState,
      evidenceRefs,
    );
    await this.options.sessionStore.revokeByPeripheral(peripheral.peripheral_id, evidenceRefs);

    const escalationId = await this.options.escalationService?.notify({
      context: `Endpoint trust incident for ${peripheral.display_name}`,
      triggerReason: input.reason_code,
      recommendation: 'Review device trust posture and re-pair only after operator review.',
      requiredAction: 'Review endpoint trust incident',
      channel: 'in-app',
      projectId: input.project_id,
      priority: input.severity === 'critical' ? 'critical' : 'high',
      timestamp: reportedAt,
    });

    const incident = EndpointIncidentRecordSchema.parse({
      incident_id: input.incident_id ?? this.nextId(),
      peripheral_id: input.peripheral_id,
      endpoint_id: input.endpoint_id,
      project_id: input.project_id,
      incident_type: input.incident_type,
      reported_by: input.reported_by,
      severity: input.severity,
      reason_code: input.reason_code,
      action_taken: actionTaken,
      escalation_id: escalationId,
      evidence_refs: escalationId ? [...evidenceRefs, `escalation:${escalationId}`] : evidenceRefs,
      reported_at: reportedAt,
    });
    await this.store.saveIncident(incident);
    return incident;
  }

  private nextId(): string {
    return this.options.idFactory?.() ?? randomUUID();
  }
}
