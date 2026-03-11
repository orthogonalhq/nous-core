import { createHash, randomUUID } from 'node:crypto';
import type {
  ConfidenceGovernanceDecisionReasonCode,
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  ICommunicationGatewayService,
  IEscalationService,
  IEndpointTrustService,
  IOpctlService,
  IPfcEngine,
  VoiceConfirmationRequirement,
  VoiceDegradedModeReason,
  VoiceDegradedModeState,
  VoiceIntentCandidate,
  VoiceTurnDecisionRecord,
  VoiceTurnEvaluationInput,
  VoiceTurnState,
  VoiceTurnStateRecord,
} from '@nous/shared';
import {
  ConfidenceGovernanceEvaluationResultSchema,
  VoiceConfirmationRequirementSchema,
  VoiceDegradedModeStateSchema,
  VoiceTurnDecisionRecordSchema,
} from '@nous/shared';
import { DegradedModeController } from './degraded-mode-controller.js';

export interface TurnEvaluatorOptions {
  pfcEngine?: IPfcEngine;
  opctlService?: IOpctlService;
  endpointTrustService?: IEndpointTrustService;
  communicationGatewayService?: ICommunicationGatewayService;
  escalationService?: IEscalationService;
  degradedModeController?: DegradedModeController;
  now?: () => string;
  idFactory?: () => string;
}

export interface TurnEvaluationResult {
  decision: VoiceTurnDecisionRecord;
  nextTurnState: VoiceTurnState;
  degradedMode: VoiceDegradedModeState;
}

const DESTRUCTIVE_ACTION_MATCHER = /(hard[_-]?stop|delete|revoke|destroy|wipe)/i;

function toEvidenceRefs(
  input: VoiceTurnEvaluationInput,
  intent: VoiceIntentCandidate | null,
  extra: string[],
): string[] {
  return [
    ...new Set([
      ...input.evidence_refs,
      ...input.intents.flatMap((candidate) => candidate.evidence_refs),
      ...(intent?.evidence_refs ?? []),
      ...extra,
    ]),
  ];
}

function hashScope(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isCombinedTurnReady(input: VoiceTurnEvaluationInput): boolean {
  return (
    input.signals.semantic_completion_score >= 0.7 &&
    input.signals.silence_window_ms >= input.signals.silence_threshold_ms &&
    input.signals.explicit_handoff_detected &&
    input.signals.handoff_confidence >= 0.65
  );
}

function deriveDegradedReason(
  input: VoiceTurnEvaluationInput,
): VoiceDegradedModeReason | undefined {
  if (input.signals.asr_confidence < 0.65) {
    return 'low_asr_confidence';
  }
  if (input.signals.intent_confidence < 0.65) {
    return 'low_intent_confidence';
  }
  if (input.signals.handoff_confidence < 0.65) {
    return 'handoff_instability';
  }
  return undefined;
}

function createFallbackConfidenceDecision(
  input: VoiceTurnEvaluationInput,
  intent: VoiceIntentCandidate | null,
): ConfidenceGovernanceEvaluationResult {
  const confidence = input.signals.intent_confidence;
  const confidenceTier = confidence >= 0.9 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const outcome = confidence < 0.6
    ? 'defer'
    : intent?.risk_level === 'critical'
      ? 'defer'
      : 'allow_autonomy';
  const reasonCode: ConfidenceGovernanceDecisionReasonCode =
    outcome === 'allow_autonomy'
      ? 'CGR-ALLOW-AUTONOMY'
      : intent?.risk_level === 'critical'
        ? 'CGR-DEFER-HIGH-RISK-CONFIRMATION'
        : 'CGR-ESCALATE-LOW-CONFIDENCE';
  return ConfidenceGovernanceEvaluationResultSchema.parse({
    outcome,
    reasonCode,
    governance:
      intent?.risk_level === 'high' || intent?.risk_level === 'critical'
        ? 'must'
        : 'may',
    actionCategory:
      intent?.action_category === 'opctl-command' ? 'opctl-command' : 'trace-persist',
    patternId: (intent?.intent_id ?? input.turn_id) as any,
    confidence,
    confidenceTier,
    supportingSignals: Math.round(input.signals.semantic_completion_score * 20),
    decayState: confidence < 0.6 ? 'decaying' : 'stable',
    autonomyAllowed: outcome === 'allow_autonomy',
    requiresConfirmation: reasonCode === 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
    highRiskOverrideApplied: reasonCode === 'CGR-DEFER-HIGH-RISK-CONFIRMATION',
    evidenceRefs: [{ actionCategory: 'trace-persist' }],
    explanation: {
      patternId: (intent?.intent_id ?? input.turn_id) as any,
      outcomeRef: `voice-turn:${input.turn_id}`,
      evidenceRefs: [{ actionCategory: 'trace-persist' }],
    },
    escalationSignal:
      outcome === 'defer' && confidence < 0.6
        ? {
            reasonCode: 'CONF-LOW',
            traceId: input.turn_id as any,
            evidenceRefs: [{ actionCategory: 'trace-persist' }],
          }
        : undefined,
  });
}

function buildConfidenceInput(
  input: VoiceTurnEvaluationInput,
  intent: VoiceIntentCandidate | null,
): ConfidenceGovernanceEvaluationInput {
  return {
    governance:
      intent?.risk_level === 'high' || intent?.risk_level === 'critical'
        ? 'must'
        : 'may',
    actionCategory:
      intent?.action_category === 'opctl-command' ? 'opctl-command' : 'trace-persist',
    projectControlState: 'running',
    pattern: {
      id: (intent?.intent_id ?? input.turn_id) as any,
      content: intent?.requested_action_ref ?? intent?.intent_class ?? 'voice_turn',
      confidence: input.signals.intent_confidence,
      basedOn: [],
      supersedes: [],
      evidenceRefs: [{ actionCategory: 'trace-persist' }],
      projectId: input.project_id,
      scope: 'project',
      tags: ['voice-control'],
      createdAt: input.signals.observed_at,
      updatedAt: input.signals.observed_at,
    },
    confidenceSignal: {
      tier:
        input.signals.intent_confidence >= 0.9
          ? 'high'
          : input.signals.intent_confidence >= 0.6
            ? 'medium'
            : 'low',
      confidence: input.signals.intent_confidence,
      supportingSignals: Math.round(input.signals.semantic_completion_score * 20),
      patternId: (intent?.intent_id ?? input.turn_id) as any,
      entryId: (intent?.intent_id ?? input.turn_id) as any,
      decayState: input.signals.intent_confidence < 0.6 ? 'decaying' : 'stable',
    },
    explanation: {
      patternId: (intent?.intent_id ?? input.turn_id) as any,
      outcomeRef: `voice-turn:${input.turn_id}`,
      evidenceRefs: [{ actionCategory: 'trace-persist' }],
    },
    escalationSignal:
      input.signals.intent_confidence < 0.6
        ? {
            reasonCode: 'CONF-LOW',
            traceId: input.turn_id as any,
            evidenceRefs: [{ actionCategory: 'trace-persist' }],
            patternId: (intent?.intent_id ?? input.turn_id) as any,
          }
        : undefined,
  };
}

async function validateRouteReference(
  gateway: ICommunicationGatewayService | undefined,
  routeRef: string | undefined,
): Promise<boolean> {
  if (!routeRef || !gateway) {
    return true;
  }
  return (await gateway.getRouteDecision(routeRef)) != null;
}

async function validateEscalationReference(
  escalationService: IEscalationService | undefined,
  escalationId: string | undefined,
): Promise<boolean> {
  if (!escalationId || !escalationService) {
    return true;
  }
  return (await escalationService.get(escalationId as any)) != null;
}

async function validateEndpointAuthorization(
  endpointTrustService: IEndpointTrustService | undefined,
  input: VoiceTurnEvaluationInput,
): Promise<boolean> {
  if (!input.endpoint_authorization || !endpointTrustService) {
    return true;
  }
  const result = await endpointTrustService.authorize({
    request_id: randomUUID(),
    endpoint_id: input.endpoint_authorization.endpoint_id,
    peripheral_id: input.endpoint_authorization.peripheral_id,
    project_id: input.project_id,
    capability_key: input.endpoint_authorization.capability_key,
    capability_class: input.endpoint_authorization.capability_class,
    risk:
      input.intents[0]?.risk_level === 'high' || input.intents[0]?.risk_level === 'critical'
        ? 'high'
        : 'standard',
    policy_ref: input.endpoint_authorization.policy_ref,
    session_id: input.endpoint_authorization.session_id,
    transport_envelope: input.endpoint_authorization.transport_envelope,
    confirmation_proof: input.confirmation_proof,
    control_command_envelope: input.control_command_envelope,
    evidence_refs: input.evidence_refs,
    requested_at: input.requested_at,
  });
  return result.decision === 'allowed';
}

function determineConfirmationRequirement(
  input: VoiceTurnEvaluationInput,
  intent: VoiceIntentCandidate | null,
  confidenceDecision: ConfidenceGovernanceEvaluationResult | undefined,
  confirmationSatisfied: boolean,
  degradedModeActive: boolean,
): VoiceConfirmationRequirement {
  const destructive =
    intent?.requested_action_ref != null &&
    DESTRUCTIVE_ACTION_MATCHER.test(intent.requested_action_ref);
  const highRisk =
    intent?.risk_level === 'high' ||
    intent?.risk_level === 'critical' ||
    intent?.action_category === 'opctl-command';
  const dualChannelRequired = intent?.risk_level === 'critical' || destructive;
  const required =
    !confirmationSatisfied &&
    (degradedModeActive ||
      dualChannelRequired ||
      highRisk ||
      confidenceDecision?.requiresConfirmation === true);

  return VoiceConfirmationRequirementSchema.parse({
    required,
    confirmation_tier: required
      ? dualChannelRequired
        ? 'T3'
        : highRisk
          ? 'T2'
          : undefined
      : undefined,
    dual_channel_required: required && dualChannelRequired,
    active_principal_session_ref: input.active_principal_session_ref,
    text_surface_targets: required ? ['chat', 'projects', 'mao'] : [],
    reason_code: required
      ? degradedModeActive
        ? 'voice_degraded_mode_active'
        : dualChannelRequired
          ? 'voice_dual_channel_confirmation_required'
          : 'voice_text_confirmation_required'
      : undefined,
  });
}

export class TurnEvaluator {
  private readonly degradedModeController: DegradedModeController;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(private readonly options: TurnEvaluatorOptions = {}) {
    this.degradedModeController =
      options.degradedModeController ?? new DegradedModeController();
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async evaluate(
    input: VoiceTurnEvaluationInput,
    currentTurn: VoiceTurnStateRecord,
    currentDegradedMode: VoiceDegradedModeState | null,
  ): Promise<TurnEvaluationResult> {
    const now = input.requested_at ?? this.now();
    const intent = input.intents[0] ?? null;
    const degradedReason = deriveDegradedReason(input);
    const degradedMode = this.degradedModeController.apply({
      current: currentDegradedMode,
      session_id: input.session_id,
      project_id: input.project_id,
      reason: degradedReason,
      now,
      evidence_refs: toEvidenceRefs(
        input,
        intent,
        degradedReason ? [`voice_degraded:${degradedReason}`] : [],
      ),
    });

    const readyBySignals = isCombinedTurnReady(input);
    const routeRef = intent?.route_ref ?? currentTurn.route_ref;
    const escalationId = intent?.escalation_id ?? currentTurn.escalation_id;
    const routeValid = await validateRouteReference(
      this.options.communicationGatewayService,
      routeRef,
    );
    const escalationValid = await validateEscalationReference(
      this.options.escalationService,
      escalationId,
    );
    const endpointAuthorized = await validateEndpointAuthorization(
      this.options.endpointTrustService,
      input,
    );

    let confidenceDecision: ConfidenceGovernanceEvaluationResult | undefined;
    if (intent && intent.intent_class !== 'non_control_message') {
      confidenceDecision = this.options.pfcEngine
        ? await this.options.pfcEngine.evaluateConfidenceGovernance(
            buildConfidenceInput(input, intent),
          )
        : createFallbackConfidenceDecision(input, intent);
    }

    const confirmationSatisfied =
      input.confirmation_proof != null &&
      input.control_command_envelope != null &&
      this.options.opctlService != null
        ? await this.options.opctlService.validateConfirmationProof(
            input.confirmation_proof,
            input.control_command_envelope,
          )
        : false;

    const confirmation = determineConfirmationRequirement(
      input,
      intent,
      confidenceDecision,
      confirmationSatisfied,
      degradedMode.active && intent?.action_category === 'opctl-command',
    );

    const extraEvidence = toEvidenceRefs(input, intent, [
      `voice_turn:${input.turn_id}`,
      `voice_signals:${hashScope(input.signals)}`,
    ]);

    let outcome: VoiceTurnDecisionRecord['outcome'];
    let nextTurnState: VoiceTurnState;

    if (!readyBySignals) {
      outcome = degradedMode.active ? 'clarify' : 'continue_listening';
      nextTurnState = 'listening';
    } else if (!routeValid || !escalationValid || !endpointAuthorized) {
      outcome = 'blocked';
      nextTurnState = 'blocked';
    } else if (confidenceDecision?.outcome === 'deny') {
      outcome = 'blocked';
      nextTurnState = 'blocked';
    } else if (
      confidenceDecision?.outcome === 'defer' ||
      confidenceDecision?.outcome === 'escalate' ||
      input.signals.intent_confidence < 0.7
    ) {
      outcome = confirmation.dual_channel_required
        ? 'dual_channel_confirmation_required'
        : intent?.risk_level === 'high' || intent?.risk_level === 'critical'
          ? 'text_confirmation_required'
          : 'clarify';
      nextTurnState =
        outcome === 'clarify' ? 'listening' : 'awaiting_text_confirmation';
    } else if (confirmation.required) {
      outcome = confirmation.dual_channel_required
        ? 'dual_channel_confirmation_required'
        : 'text_confirmation_required';
      nextTurnState = 'awaiting_text_confirmation';
    } else {
      outcome = 'ready_for_canonical_execution';
      nextTurnState = 'completed';
    }

    const decision = VoiceTurnDecisionRecordSchema.parse({
      decision_id: this.idFactory(),
      turn_id: input.turn_id,
      session_id: input.session_id,
      project_id: input.project_id,
      outcome,
      intent,
      signals: input.signals,
      confidence_decision: confidenceDecision,
      confirmation,
      degraded_mode_active: degradedMode.active,
      degraded_reason: degradedMode.reason,
      route_ref: routeRef,
      escalation_id: escalationId,
      decision_ref: `voice-decision:${input.turn_id}`,
      evidence_refs:
        extraEvidence.length > 0 ? extraEvidence : [`voice_turn:${input.turn_id}`],
      decided_at: now,
    });

    return {
      decision,
      nextTurnState,
      degradedMode: VoiceDegradedModeStateSchema.parse(degradedMode),
    };
  }
}
