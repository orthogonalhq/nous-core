import { randomUUID } from 'node:crypto';
import type {
  ICommunicationGatewayService,
  IDocumentStore,
  IEscalationService,
  IEndpointTrustService,
  IOpctlService,
  IPfcEngine,
  IVoiceControlService,
  IWitnessService,
  ProjectId,
  VoiceAssistantOutputInput,
  VoiceAssistantOutputStateRecord,
  VoiceBargeInInput,
  VoiceBargeInRecord,
  VoiceContinuationInput,
  VoiceContinuationRecord,
  VoiceSessionProjection,
  VoiceSessionProjectionInput,
  VoiceTurnDecisionRecord,
  VoiceTurnEvaluationInput,
  VoiceTurnStartInput,
  VoiceTurnStateRecord,
} from '@nous/shared';
import {
  VoiceAssistantOutputInputSchema,
  VoiceAssistantOutputStateRecordSchema,
  VoiceBargeInInputSchema,
  VoiceContinuationInputSchema,
  VoiceDegradedModeStateSchema,
  VoiceSessionProjectionInputSchema,
  VoiceSessionProjectionSchema,
  VoiceTurnEvaluationInputSchema,
  VoiceTurnStartInputSchema,
  VoiceTurnStateRecordSchema,
} from '@nous/shared';
import { ContinuationOrchestrator } from './continuation-orchestrator.js';
import { DegradedModeController } from './degraded-mode-controller.js';
import { DocumentVoiceControlStore } from './document-voice-control-store.js';
import { TurnEvaluator } from './turn-evaluator.js';

export interface VoiceControlServiceOptions {
  documentStore?: IDocumentStore;
  voiceControlStore?: DocumentVoiceControlStore;
  pfcEngine?: IPfcEngine;
  opctlService?: IOpctlService;
  endpointTrustService?: IEndpointTrustService;
  communicationGatewayService?: ICommunicationGatewayService;
  escalationService?: IEscalationService;
  witnessService?: IWitnessService;
  degradedModeController?: DegradedModeController;
  continuationOrchestrator?: ContinuationOrchestrator;
  turnEvaluator?: TurnEvaluator;
  eventBus?: import('@nous/shared').IEventBus;
  now?: () => string;
  idFactory?: () => string;
}

function isoNow(): string {
  return new Date().toISOString();
}

function defaultConfirmation() {
  return {
    required: false,
    dual_channel_required: false,
    text_surface_targets: [],
  };
}

export class VoiceControlService implements IVoiceControlService {
  private readonly store: DocumentVoiceControlStore;
  private readonly degradedModeController: DegradedModeController;
  private readonly continuationOrchestrator: ContinuationOrchestrator;
  private readonly turnEvaluator: TurnEvaluator;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly eventBus?: import('@nous/shared').IEventBus;

  constructor(private readonly options: VoiceControlServiceOptions) {
    this.eventBus = options.eventBus;
    if (!options.voiceControlStore && !options.documentStore) {
      throw new Error('VoiceControlService requires documentStore or voiceControlStore');
    }

    this.now = options.now ?? isoNow;
    this.idFactory = options.idFactory ?? randomUUID;
    this.store =
      options.voiceControlStore ??
      new DocumentVoiceControlStore(options.documentStore!);
    this.degradedModeController =
      options.degradedModeController ?? new DegradedModeController();
    this.continuationOrchestrator =
      options.continuationOrchestrator ??
      new ContinuationOrchestrator({
        now: this.now,
        idFactory: this.idFactory,
      });
    this.turnEvaluator =
      options.turnEvaluator ??
      new TurnEvaluator({
        pfcEngine: options.pfcEngine,
        opctlService: options.opctlService,
        endpointTrustService: options.endpointTrustService,
        communicationGatewayService: options.communicationGatewayService,
        escalationService: options.escalationService,
        degradedModeController: this.degradedModeController,
        now: this.now,
        idFactory: this.idFactory,
      });
  }

  async beginTurn(input: VoiceTurnStartInput): Promise<VoiceTurnStateRecord> {
    const parsed = VoiceTurnStartInputSchema.parse(input);
    const now = parsed.started_at ?? this.now();
    const record = VoiceTurnStateRecordSchema.parse({
      turn_id: parsed.turn_id ?? this.idFactory(),
      session_id: parsed.session_id,
      project_id: parsed.project_id,
      principal_id: parsed.principal_id,
      state: 'listening',
      route_ref: parsed.route_ref,
      escalation_id: parsed.escalation_id,
      started_at: now,
      updated_at: now,
      evidence_refs: parsed.evidence_refs,
    });
    await this.store.saveTurn(record);
    await this.store.saveSessionProjection(
      VoiceSessionProjectionSchema.parse({
        session_id: record.session_id,
        project_id: record.project_id,
        principal_id: record.principal_id,
        current_turn_state: record.state,
        assistant_output_state: 'idle',
        degraded_mode: VoiceDegradedModeStateSchema.parse({
          session_id: record.session_id,
          project_id: record.project_id,
          active: false,
          evidence_refs: [],
        }),
        pending_confirmation: defaultConfirmation(),
        continuation_required: false,
        last_route_ref: record.route_ref,
        last_escalation_id: record.escalation_id,
        evidence_refs: record.evidence_refs,
        updated_at: now,
      }),
    );
    await this.recordWitness(`voice-turn:${record.turn_id}`, 'succeeded', {
      event: 'voice_turn_started',
      sessionId: record.session_id,
      projectId: record.project_id,
    }, record.project_id);
    this.eventBus?.publish('voice:state-change', { turnId: record.turn_id, state: 'recording' });
    return record;
  }

  async evaluateTurn(
    input: VoiceTurnEvaluationInput,
  ): Promise<VoiceTurnDecisionRecord> {
    const parsed = VoiceTurnEvaluationInputSchema.parse(input);
    const currentTurn = await this.store.getTurn(parsed.turn_id);
    if (!currentTurn) {
      throw new Error(`Voice turn not found: ${parsed.turn_id}`);
    }

    const currentDegradedMode = await this.store.getDegradedMode(parsed.session_id);
    const evaluation = await this.turnEvaluator.evaluate(
      parsed,
      currentTurn,
      currentDegradedMode,
    );
    const updatedTurn = VoiceTurnStateRecordSchema.parse({
      ...currentTurn,
      state: evaluation.nextTurnState,
      route_ref: evaluation.decision.route_ref ?? currentTurn.route_ref,
      escalation_id: evaluation.decision.escalation_id ?? currentTurn.escalation_id,
      updated_at: evaluation.decision.decided_at,
      evidence_refs: [
        ...new Set([
          ...currentTurn.evidence_refs,
          ...evaluation.decision.evidence_refs,
        ]),
      ],
    });

    await this.store.saveDecision(evaluation.decision);
    await this.store.saveTurn(updatedTurn);
    await this.store.saveDegradedMode(evaluation.degradedMode);
    await this.updateProjection(parsed.project_id, parsed.session_id, updatedTurn.principal_id);
    await this.recordWitness(
      `voice-turn:${parsed.turn_id}`,
      evaluation.decision.outcome === 'blocked' ? 'blocked' : 'succeeded',
      {
        event:
          evaluation.decision.outcome === 'blocked'
            ? 'voice_action_blocked'
            : evaluation.decision.outcome === 'ready_for_canonical_execution'
              ? 'voice_action_authorized'
              : 'voice_policy_evaluated',
        outcome: evaluation.decision.outcome,
        reasonCode: evaluation.decision.confirmation.reason_code,
      },
      parsed.project_id,
    );
    this.eventBus?.publish('voice:state-change', {
      turnId: parsed.turn_id,
      state: evaluation.nextTurnState as 'recording' | 'evaluating' | 'barge-in' | 'continuation' | 'idle',
    });
    return evaluation.decision;
  }

  async registerAssistantOutput(
    input: VoiceAssistantOutputInput,
  ): Promise<VoiceAssistantOutputStateRecord> {
    const parsed = VoiceAssistantOutputInputSchema.parse(input);
    const record = this.continuationOrchestrator.registerOutput(parsed);
    await this.store.saveAssistantOutput(record);
    await this.updateProjection(parsed.project_id, parsed.session_id);
    await this.recordWitness(`voice-output:${record.output_id}`, 'succeeded', {
      event: 'voice_turn_ended',
      state: record.state,
    }, parsed.project_id);
    this.eventBus?.publish('voice:transcription', { turnId: record.output_id, transcript: '' });
    return record;
  }

  async handleBargeIn(input: VoiceBargeInInput): Promise<VoiceBargeInRecord> {
    const parsed = VoiceBargeInInputSchema.parse(input);
    const activeOutput = await this.store.getAssistantOutput(parsed.active_output_id);
    const bargeIn = this.continuationOrchestrator.handleBargeIn(parsed);
    await this.store.saveBargeIn(bargeIn);
    if (activeOutput) {
      await this.store.saveAssistantOutput(
        VoiceAssistantOutputStateRecordSchema.parse({
          ...activeOutput,
          state: 'awaiting_continuation',
          updated_at: parsed.stop_completed_at,
          completed_at: parsed.stop_completed_at,
          evidence_refs: [
            ...new Set([...activeOutput.evidence_refs, ...parsed.evidence_refs]),
          ],
        }),
      );
    }

    const degradedMode = this.degradedModeController.apply({
      current: await this.store.getDegradedMode(parsed.session_id),
      session_id: parsed.session_id,
      project_id: parsed.project_id,
      reason: 'barge_in_recovery_required',
      now: parsed.stop_completed_at,
      evidence_refs: bargeIn.evidence_refs,
    });
    await this.store.saveDegradedMode(degradedMode);

    const turns = await this.store.listTurnsBySession(parsed.session_id);
    if (turns[0]) {
      await this.store.saveTurn(
        VoiceTurnStateRecordSchema.parse({
          ...turns[0],
          state: 'continuation_required',
          updated_at: parsed.stop_completed_at,
          evidence_refs: [
            ...new Set([...turns[0].evidence_refs, ...parsed.evidence_refs]),
          ],
        }),
      );
    }

    await this.updateProjection(parsed.project_id, parsed.session_id);
    await this.recordWitness(`voice-barge-in:${bargeIn.barge_in_id}`, 'succeeded', {
      event: 'voice_barge_in_detected',
      latencyMs: bargeIn.latency_ms,
    }, parsed.project_id);
    this.eventBus?.publish('voice:state-change', { turnId: bargeIn.barge_in_id, state: 'barge-in' });
    return bargeIn;
  }

  async resolveContinuation(
    input: VoiceContinuationInput,
  ): Promise<VoiceContinuationRecord> {
    const parsed = VoiceContinuationInputSchema.parse(input);
    const outputs = await this.store.listAssistantOutputsBySession(parsed.session_id);
    const currentOutput =
      parsed.output_id != null
        ? await this.store.getAssistantOutput(parsed.output_id)
        : outputs[0] ?? null;
    const result = this.continuationOrchestrator.resolve(parsed, currentOutput);
    await this.store.saveContinuation(result.continuation);
    if (result.nextOutputState) {
      await this.store.saveAssistantOutput(result.nextOutputState);
    }

    const turns = await this.store.listTurnsBySession(parsed.session_id);
    if (turns[0]) {
      await this.store.saveTurn(
        VoiceTurnStateRecordSchema.parse({
          ...turns[0],
          state: result.nextTurnState,
          updated_at: result.continuation.resolved_at,
          evidence_refs: [
            ...new Set([...turns[0].evidence_refs, ...parsed.evidence_refs]),
          ],
        }),
      );
    }

    const degradedMode = this.degradedModeController.apply({
      current: await this.store.getDegradedMode(parsed.session_id),
      session_id: parsed.session_id,
      project_id: parsed.project_id,
      now: result.continuation.resolved_at,
      evidence_refs: result.continuation.evidence_refs,
    });
    await this.store.saveDegradedMode(degradedMode);
    await this.updateProjection(parsed.project_id, parsed.session_id, parsed.principal_id);
    await this.recordWitness(
      `voice-continuation:${result.continuation.continuation_id}`,
      'succeeded',
      {
        event: 'voice_assistant_output_stopped',
        resolution: result.continuation.resolution,
      },
      parsed.project_id,
    );
    this.eventBus?.publish('voice:state-change', {
      turnId: result.continuation.continuation_id,
      state: 'continuation',
    });
    return result.continuation;
  }

  async getSessionProjection(
    input: VoiceSessionProjectionInput,
  ): Promise<VoiceSessionProjection> {
    const parsed = VoiceSessionProjectionInputSchema.parse(input);
    const existing = parsed.session_id
      ? await this.store.getSessionProjection(parsed.session_id)
      : null;
    if (existing) {
      return existing;
    }

    const projections = await this.store.listSessionProjectionsByProject(parsed.project_id);
    if (parsed.session_id == null && projections[0]) {
      return projections[0];
    }

    const turns = parsed.session_id
      ? await this.store.listTurnsBySession(parsed.session_id)
      : await this.store.listTurnsByProject(parsed.project_id);
    const currentTurn = turns[0];
    if (!currentTurn) {
      throw new Error(
        `Voice session projection not found for project ${parsed.project_id}`,
      );
    }
    await this.updateProjection(
      parsed.project_id,
      currentTurn.session_id,
      parsed.principal_id ?? currentTurn.principal_id,
    );
    const hydrated = await this.store.getSessionProjection(currentTurn.session_id);
    if (!hydrated) {
      throw new Error(
        `Voice session projection not found for session ${currentTurn.session_id}`,
      );
    }
    return hydrated;
  }

  private async updateProjection(
    projectId: ProjectId,
    sessionId: string,
    principalId?: string,
  ): Promise<VoiceSessionProjection> {
    const turns = await this.store.listTurnsBySession(sessionId);
    const decisions = await this.store.listDecisionsBySession(sessionId);
    const outputs = await this.store.listAssistantOutputsBySession(sessionId);
    const continuations = await this.store.listContinuationsBySession(sessionId);
    const degradedMode =
      (await this.store.getDegradedMode(sessionId)) ??
      VoiceDegradedModeStateSchema.parse({
        session_id: sessionId,
        project_id: projectId,
        active: false,
        evidence_refs: [],
      });

    const latestTurn = turns[0];
    const latestDecision = decisions[0];
    const latestOutput = outputs[0];
    const latestContinuation = continuations[0];

    const projection = VoiceSessionProjectionSchema.parse({
      session_id: sessionId,
      project_id: projectId,
      principal_id: principalId ?? latestTurn?.principal_id ?? 'unknown',
      current_turn_state: latestTurn?.state ?? 'completed',
      assistant_output_state: latestOutput?.state ?? 'idle',
      degraded_mode: degradedMode,
      pending_confirmation:
        latestDecision?.confirmation ?? defaultConfirmation(),
      continuation_required:
        latestTurn?.state === 'continuation_required' ||
        latestOutput?.state === 'awaiting_continuation' ||
        latestContinuation?.continuation_required === true,
      last_route_ref: latestDecision?.route_ref ?? latestTurn?.route_ref,
      last_escalation_id:
        latestDecision?.escalation_id ?? latestTurn?.escalation_id,
      evidence_refs: [
        ...new Set([
          ...(latestTurn?.evidence_refs ?? []),
          ...(latestDecision?.evidence_refs ?? []),
          ...(latestOutput?.evidence_refs ?? []),
          ...(degradedMode.evidence_refs ?? []),
        ]),
      ],
      updated_at:
        latestDecision?.decided_at ??
        latestOutput?.updated_at ??
        latestTurn?.updated_at ??
        this.now(),
    });
    await this.store.saveSessionProjection(projection);
    return projection;
  }

  private async recordWitness(
    actionRef: string,
    status: 'succeeded' | 'blocked',
    detail: Record<string, unknown>,
    projectId?: ProjectId,
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
