import { describe, expect, it } from 'vitest';
import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  ICommunicationGatewayService,
  IEscalationService,
  IEndpointTrustService,
  IOpctlService,
  IPfcEngine,
  IVoiceControlService,
  IWitnessService,
  ProjectId,
  VoiceSessionProjection,
} from '@nous/shared';
import { VoiceControlService } from '../voice-control-service.js';
import { createMemoryDocumentStore } from './test-store.js';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655449501' as ProjectId;
const SESSION_ID = '550e8400-e29b-41d4-a716-446655449502';
const TURN_ID = '550e8400-e29b-41d4-a716-446655449503';

class FakePfcEngine implements IPfcEngine {
  async evaluateConfidenceGovernance(
    input: ConfidenceGovernanceEvaluationInput,
  ): Promise<ConfidenceGovernanceEvaluationResult> {
    return {
      outcome: input.confidenceSignal.confidence < 0.7 ? 'defer' : 'allow_autonomy',
      reasonCode:
        input.confidenceSignal.confidence < 0.7
          ? 'CGR-ESCALATE-LOW-CONFIDENCE'
          : 'CGR-ALLOW-AUTONOMY',
      governance: input.governance,
      actionCategory: input.actionCategory,
      projectControlState: input.projectControlState,
      patternId: input.pattern.id,
      confidence: input.confidenceSignal.confidence,
      confidenceTier: input.confidenceSignal.tier,
      supportingSignals: input.confidenceSignal.supportingSignals,
      decayState: input.confidenceSignal.decayState,
      autonomyAllowed: input.confidenceSignal.confidence >= 0.7,
      requiresConfirmation: false,
      highRiskOverrideApplied: false,
      evidenceRefs: input.pattern.evidenceRefs,
      explanation: input.explanation,
      escalationSignal: input.escalationSignal,
    };
  }
  async evaluateMemoryWrite(): Promise<any> { throw new Error('unused'); }
  async evaluateMemoryMutation(): Promise<any> { throw new Error('unused'); }
  async evaluateToolExecution(): Promise<any> { throw new Error('unused'); }
  async reflect(): Promise<any> { throw new Error('unused'); }
  async evaluateEscalation(): Promise<any> { throw new Error('unused'); }
  getTier(): any { return 'tier_0'; }
}

class FakeOpctlService implements IOpctlService {
  constructor(private readonly proofValid: boolean) {}
  async submitCommand(): Promise<any> { throw new Error('unused'); }
  async requestConfirmationProof(): Promise<any> { throw new Error('unused'); }
  async validateConfirmationProof(): Promise<boolean> { return this.proofValid; }
  async resolveScope(): Promise<any> { throw new Error('unused'); }
  async hasStartLock(): Promise<boolean> { return false; }
  async setStartLock(): Promise<void> {}
  async getProjectControlState(): Promise<any> { return 'running'; }
}

class FakeGatewayService implements ICommunicationGatewayService {
  constructor(private readonly routeExists = true) {}
  async receiveIngress(): Promise<any> { throw new Error('unused'); }
  async dispatchEgress(): Promise<any> { throw new Error('unused'); }
  async upsertBinding(): Promise<any> { throw new Error('unused'); }
  async listApprovalIntake(): Promise<any> { return []; }
  async acknowledgeEscalation(): Promise<any> { return null; }
  async getRouteDecision(): Promise<any> {
    return this.routeExists ? { route_id: 'route-1' } : null;
  }
}

class FakeEscalationService implements IEscalationService {
  async notify(): Promise<any> { throw new Error('unused'); }
  async checkResponse(): Promise<any> { return null; }
  async get(): Promise<any> { return { escalation_id: 'escalation-1' }; }
  async listProjectQueue(): Promise<any> { return []; }
  async acknowledge(): Promise<any> { return null; }
}

class FakeEndpointTrustService implements IEndpointTrustService {
  constructor(private readonly allowed = true) {}
  async requestPairing(): Promise<any> { throw new Error('unused'); }
  async reviewPairing(): Promise<any> { throw new Error('unused'); }
  async registerEndpoint(): Promise<any> { throw new Error('unused'); }
  async grantCapability(): Promise<any> { throw new Error('unused'); }
  async revokeCapability(): Promise<any> { throw new Error('unused'); }
  async establishSession(): Promise<any> { throw new Error('unused'); }
  async rotateSession(): Promise<any> { throw new Error('unused'); }
  async validateTransport(): Promise<any> { throw new Error('unused'); }
  async authorize(): Promise<any> { return { decision: this.allowed ? 'allowed' : 'blocked' }; }
  async reportIncident(): Promise<any> { throw new Error('unused'); }
  async getPeripheral(): Promise<any> { return null; }
  async getEndpoint(): Promise<any> { return null; }
}

class FakeWitnessService implements IWitnessService {
  private sequence = 0;
  async appendAuthorization(input: any): Promise<any> {
    this.sequence += 1;
    return {
      id: `evt-${this.sequence}`,
      sequence: this.sequence,
      previousEventHash: null,
      payloadHash: 'a'.repeat(64),
      eventHash: 'b'.repeat(64),
      stage: 'authorization',
      actionCategory: input.actionCategory,
      actionRef: input.actionRef,
      actor: input.actor,
      status: input.status,
      detail: input.detail,
      occurredAt: input.occurredAt ?? '2026-03-11T00:00:00.000Z',
      recordedAt: '2026-03-11T00:00:00.000Z',
    };
  }
  async appendCompletion(input: any): Promise<any> {
    this.sequence += 1;
    return {
      id: `evt-${this.sequence}`,
      sequence: this.sequence,
      previousEventHash: 'b'.repeat(64),
      payloadHash: 'c'.repeat(64),
      eventHash: 'd'.repeat(64),
      stage: 'completion',
      actionCategory: input.actionCategory,
      actionRef: input.actionRef,
      authorizationRef: input.authorizationRef,
      actor: input.actor,
      status: input.status,
      detail: input.detail,
      occurredAt: input.occurredAt ?? '2026-03-11T00:00:00.000Z',
      recordedAt: '2026-03-11T00:00:00.000Z',
    };
  }
  async appendInvariant(): Promise<any> { throw new Error('unused'); }
  async createCheckpoint(): Promise<any> { throw new Error('unused'); }
  async rotateKeyEpoch(): Promise<number> { return 1; }
  async verify(): Promise<any> { throw new Error('unused'); }
  async getReport(): Promise<any> { return null; }
  async listReports(): Promise<any> { return []; }
  async getLatestCheckpoint(): Promise<any> { return null; }
}

function createService(options?: {
  proofValid?: boolean;
  routeExists?: boolean;
  endpointAllowed?: boolean;
}): IVoiceControlService {
  return new VoiceControlService({
    documentStore: createMemoryDocumentStore(),
    pfcEngine: new FakePfcEngine(),
    opctlService: new FakeOpctlService(options?.proofValid ?? false),
    communicationGatewayService: new FakeGatewayService(options?.routeExists ?? true),
    escalationService: new FakeEscalationService(),
    endpointTrustService: new FakeEndpointTrustService(options?.endpointAllowed ?? true),
    witnessService: new FakeWitnessService(),
    now: () => '2026-03-11T00:00:00.000Z',
    idFactory: (() => {
      let counter = 0;
      return () => `550e8400-e29b-41d4-a716-44665544960${counter++}`;
    })(),
  });
}

async function beginTurn(service: IVoiceControlService) {
  await service.beginTurn({
    turn_id: TURN_ID,
    session_id: SESSION_ID,
    project_id: PROJECT_ID,
    principal_id: 'principal',
    channel: 'web',
    evidence_refs: ['voice:turn'],
  });
}

describe('VoiceControlService', () => {
  it('keeps high-risk voice actions in text confirmation posture without proof', async () => {
    const service = createService();
    await beginTurn(service);

    const result = await service.evaluateTurn({
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      signals: {
        transcript_hash: 'a'.repeat(64),
        handoff_keywords_detected: ['done'],
        semantic_completion_score: 0.95,
        silence_window_ms: 1000,
        silence_threshold_ms: 500,
        explicit_handoff_detected: true,
        asr_confidence: 0.95,
        intent_confidence: 0.92,
        handoff_confidence: 0.9,
        observed_at: '2026-03-11T00:00:00.000Z',
      },
      intents: [
        {
          intent_id: '550e8400-e29b-41d4-a716-446655449504',
          turn_id: TURN_ID,
          project_id: PROJECT_ID,
          intent_class: 'project_control',
          action_category: 'opctl-command',
          risk_level: 'high',
          route_ref: 'route-1',
          requested_action_ref: 'project.pause',
          evidence_refs: ['voice:intent'],
        },
      ],
      evidence_refs: ['voice:evaluate'],
    });

    expect(result.outcome).toBe('text_confirmation_required');
    const projection = await service.getSessionProjection({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
    });
    expect(projection.pending_confirmation.required).toBe(true);
  });

  it('blocks when canonical route references cannot be resolved', async () => {
    const service = createService({ routeExists: false });
    await beginTurn(service);

    const result = await service.evaluateTurn({
      turn_id: TURN_ID,
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      principal_id: 'principal',
      signals: {
        transcript_hash: 'b'.repeat(64),
        handoff_keywords_detected: ['ack'],
        semantic_completion_score: 0.95,
        silence_window_ms: 800,
        silence_threshold_ms: 500,
        explicit_handoff_detected: true,
        asr_confidence: 0.95,
        intent_confidence: 0.9,
        handoff_confidence: 0.9,
        observed_at: '2026-03-11T00:00:00.000Z',
      },
      intents: [
        {
          intent_id: '550e8400-e29b-41d4-a716-446655449505',
          turn_id: TURN_ID,
          project_id: PROJECT_ID,
          intent_class: 'escalation_acknowledgement',
          action_category: 'communication-ack',
          risk_level: 'low',
          route_ref: 'missing-route',
          escalation_id: '550e8400-e29b-41d4-a716-446655449506' as any,
          evidence_refs: ['voice:intent'],
        },
      ],
      evidence_refs: ['voice:evaluate'],
    });

    expect(result.outcome).toBe('blocked');
  });

  it('records barge-in and explicit continuation state for session projections', async () => {
    const service = createService({ proofValid: true });
    await beginTurn(service);
    await service.registerAssistantOutput({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      output_id: '550e8400-e29b-41d4-a716-446655449507',
      output_hash: 'c'.repeat(64),
      state: 'speaking',
      started_at: '2026-03-11T00:00:00.000Z',
      evidence_refs: ['voice:output'],
    });

    await service.handleBargeIn({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      active_output_id: '550e8400-e29b-41d4-a716-446655449507',
      detected_at: '2026-03-11T00:00:00.000Z',
      stop_completed_at: '2026-03-11T00:00:00.150Z',
      evidence_refs: ['voice:barge'],
    });
    let projection: VoiceSessionProjection = await service.getSessionProjection({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
    });
    expect(projection.continuation_required).toBe(true);
    expect(projection.degraded_mode.active).toBe(true);

    await service.resolveContinuation({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
      output_id: '550e8400-e29b-41d4-a716-446655449507',
      principal_id: 'principal',
      resolution: 'resume_assistant',
      requested_at: '2026-03-11T00:01:00.000Z',
      evidence_refs: ['voice:continue'],
    });
    projection = await service.getSessionProjection({
      session_id: SESSION_ID,
      project_id: PROJECT_ID,
    });
    expect(projection.continuation_required).toBe(false);
  });
});
