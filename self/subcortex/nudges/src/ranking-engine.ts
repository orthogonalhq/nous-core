import { randomUUID } from 'node:crypto';
import type {
  IPfcEngine,
  NudgeRankComponent,
  NudgeRankedDecision,
  NudgeRankingCandidateInput,
  NudgeRankingFeatureInput,
  NudgeRankingRequest,
  NudgeRankingResult,
  NudgeReasonCode,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  NudgeDecisionSchema,
  NudgeRankComponentSchema,
  NudgeRankedDecisionSchema,
  NudgeRankingRequestSchema,
  NudgeRankingResultSchema,
} from '@nous/shared';
import { RankingPolicyStore } from './ranking-policy-store.js';

export interface RankingEngineOptions {
  rankingPolicyStore: RankingPolicyStore;
  pfcEngine?: IPfcEngine;
  now?: () => string;
  idFactory?: () => string;
}

function evidenceRefKey(ref: TraceEvidenceReference): string {
  return JSON.stringify(
    Object.entries(ref).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeEvidenceRefs(
  ...collections: Array<readonly TraceEvidenceReference[] | undefined>
): TraceEvidenceReference[] {
  const merged = new Map<string, TraceEvidenceReference>();
  for (const refs of collections) {
    for (const ref of refs ?? []) {
      merged.set(evidenceRefKey(ref), ref);
    }
  }
  return [...merged.values()];
}

function scoreFeatures(features: NudgeRankingFeatureInput, weights: {
  relevance: number;
  expected_outcome_gain: number;
  trust_confidence: number;
  compatibility_confidence: number;
  novelty: number;
  fatigue_penalty: number;
  risk_penalty: number;
}): NudgeRankComponent {
  const finalScore =
    features.relevance * weights.relevance +
    features.expected_outcome_gain * weights.expected_outcome_gain +
    features.trust_confidence * weights.trust_confidence +
    features.compatibility_confidence * weights.compatibility_confidence +
    features.novelty * weights.novelty -
    features.fatigue_penalty * weights.fatigue_penalty -
    features.risk_penalty * weights.risk_penalty;

  return NudgeRankComponentSchema.parse({
    ...features,
    final_score: finalScore,
  });
}

function isConfidenceBlocked(outcome?: string): boolean {
  return outcome === 'deny' || outcome === 'defer' || outcome === 'escalate';
}

function buildReasonCodes(
  input: NudgeRankingCandidateInput,
  confidenceBlocked: boolean,
): NudgeReasonCode[] {
  const codes: NudgeReasonCode[] = [
    'NDG-RANK-POLICY-VERSION-APPLIED',
    ...input.envelope.reason_codes,
  ];

  if (confidenceBlocked) {
    codes.push('NDG-DELIVERY-BLOCKED-CONFIDENCE');
  } else if (!input.envelope.blocked) {
    codes.push('NDG-DELIVERY-ALLOWED');
  }

  return [...new Set(codes)];
}

export class RankingEngine {
  private readonly rankingPolicyStore: RankingPolicyStore;
  private readonly pfcEngine?: IPfcEngine;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: RankingEngineOptions) {
    this.rankingPolicyStore = options.rankingPolicyStore;
    this.pfcEngine = options.pfcEngine;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async rank(input: NudgeRankingRequest): Promise<NudgeRankingResult> {
    const parsed = NudgeRankingRequestSchema.parse(input);
    const policy = await this.rankingPolicyStore.getPolicy(parsed.policy_version);
    if (!policy) {
      throw new Error(
        `Ranking policy not found or inactive: ${parsed.policy_version ?? 'current'}`,
      );
    }

    const decisions: NudgeRankedDecision[] = [];
    for (const candidateInput of parsed.candidates) {
      const rankedAt = parsed.ranked_at ?? this.now();
      const components = scoreFeatures(candidateInput.features, policy.scoring_weights);
      const confidence = candidateInput.confidence_governance_input && this.pfcEngine
        ? await this.pfcEngine.evaluateConfidenceGovernance(
            candidateInput.confidence_governance_input,
          )
        : undefined;
      const confidenceBlocked = isConfidenceBlocked(confidence?.outcome);
      const deliverable = !candidateInput.envelope.blocked && !confidenceBlocked;

      decisions.push(
        NudgeRankedDecisionSchema.parse({
          decision: NudgeDecisionSchema.parse({
            decision_id: this.idFactory(),
            candidate_id: candidateInput.envelope.candidate.candidate_id,
            rank_score: components.final_score,
            rank_components_ref: `rank:${policy.version}:${candidateInput.envelope.candidate.candidate_id}`,
            suppression_state: 'eligible',
            delivery_surface_set: [parsed.surface],
            expires_at: rankedAt,
          }),
          policy_version: policy.version,
          components,
          confidence_governance: confidence,
          reason_codes: buildReasonCodes(candidateInput, confidenceBlocked),
          evidence_refs: mergeEvidenceRefs(
            candidateInput.envelope.evidence_refs,
            confidence?.evidenceRefs,
          ),
          deliverable,
        }),
      );
    }

    decisions.sort((left, right) => right.components.final_score - left.components.final_score);

    return NudgeRankingResultSchema.parse({
      policy,
      decisions,
      ranked_at: parsed.ranked_at ?? this.now(),
    });
  }
}
