import { randomUUID } from 'node:crypto';
import type {
  IRegistryService,
  INudgeDiscoveryService,
  MarketplaceNudgeFeedRequest,
  MarketplaceNudgeFeedSnapshot,
  NudgeCandidateEnvelope,
  NudgeAcceptanceRouteRequest,
  NudgeAcceptanceRouteResult,
  NudgeCandidateGenerationInput,
  NudgeCandidateGenerationResult,
  NudgeDeliveryRecord,
  NudgeDeliveryRecordInput,
  NudgeFeedbackRecord,
  NudgeFeedbackRecordInput,
  NudgeRankingPolicy,
  NudgeRankingFeatureInput,
  NudgeRankingRequest,
  NudgeRankingResult,
  NudgeSuppressionMutationInput,
  NudgeSuppressionQuery,
  NudgeSuppressionQueryResult,
  NudgeSuppressionRecord,
  NudgeSignalRecord,
  NudgeSignalRecordInput,
  NudgeSuppressionCheckRequest,
  NudgeSuppressionCheckResult,
  TraceEvidenceReference,
} from '@nous/shared';
import {
  MarketplaceNudgeFeedSnapshotSchema,
  MarketplaceNudgeFeedRequestSchema,
  MarketplaceSurfaceLink,
  NudgeCandidateEnvelopeSchema,
  NudgeDeliveryRecordInputSchema,
  NudgeDeliveryRecordSchema,
  NudgeFeedbackRecordInputSchema,
  NudgeFeedbackRecordSchema,
  NudgeSuppressionMutationInputSchema,
  NudgeSuppressionQueryResultSchema,
  NudgeSuppressionQuerySchema,
  NudgeSuppressionRecordSchema,
} from '@nous/shared';
import { AcceptanceRouter } from './acceptance-router.js';
import { CandidateGenerator } from './candidate-generator.js';
import { DocumentNudgeStore } from './document-nudge-store.js';
import { FeedbackStore } from './feedback-store.js';
import { RankingEngine } from './ranking-engine.js';
import { RankingPolicyStore } from './ranking-policy-store.js';
import { SignalRecorder } from './signal-recorder.js';
import { SuppressionEngine } from './suppression-engine.js';
import { SuppressionStore } from './suppression-store.js';

export interface NudgeDiscoveryServiceOptions {
  store: DocumentNudgeStore;
  registryService?: IRegistryService;
  rankingPolicyStore?: RankingPolicyStore;
  signalRecorder?: SignalRecorder;
  candidateGenerator?: CandidateGenerator;
  rankingEngine?: RankingEngine;
  suppressionStore?: SuppressionStore;
  suppressionEngine?: SuppressionEngine;
  feedbackStore?: FeedbackStore;
  acceptanceRouter?: AcceptanceRouter;
  now?: () => string;
  idFactory?: () => string;
}

const DEFAULT_SIGNAL_EVIDENCE_REF = {
  actionCategory: 'trace-persist',
} as const satisfies TraceEvidenceReference;

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

function stableCandidateId(packageId: string, projectId?: string): string {
  return `candidate:${projectId ?? 'global'}:${packageId}`;
}

function mapFeedbackEvent(action: NudgeSuppressionMutationInput['action']) {
  switch (action) {
    case 'dismiss_once':
      return 'dismissed' as const;
    case 'snooze':
      return 'snoozed' as const;
    case 'mute_category':
      return 'muted_category' as const;
    case 'mute_project':
      return 'muted_project' as const;
    case 'mute_global':
    default:
      return 'muted_global' as const;
  }
}

function mapSuppressionReasonCode(action: NudgeSuppressionMutationInput['action']) {
  switch (action) {
    case 'dismiss_once':
      return 'NDG-SUPPRESSION-DISMISS-ONCE' as const;
    case 'snooze':
      return 'NDG-SUPPRESSION-SNOOZE-ACTIVE' as const;
    case 'mute_category':
      return 'NDG-SUPPRESSION-MUTED-CATEGORY' as const;
    case 'mute_project':
      return 'NDG-SUPPRESSION-MUTED-PROJECT' as const;
    case 'mute_global':
    default:
      return 'NDG-SUPPRESSION-MUTED-GLOBAL' as const;
  }
}

function trustScore(trustTier: string): number {
  switch (trustTier) {
    case 'nous_first_party':
      return 1;
    case 'verified_maintainer':
      return 0.9;
    case 'community_unverified':
      return 0.6;
    case 'unregistered_external':
    default:
      return 0.2;
  }
}

function compatibilityScore(compatibilityState: string): number {
  switch (compatibilityState) {
    case 'compatible':
      return 1;
    case 'requires_migration':
      return 0.6;
    case 'blocked_incompatible':
    default:
      return 0.1;
  }
}

export class NudgeDiscoveryService implements INudgeDiscoveryService {
  private readonly store: DocumentNudgeStore;
  private readonly registryService?: IRegistryService;
  private readonly rankingPolicyStore: RankingPolicyStore;
  private readonly signalRecorder: SignalRecorder;
  private readonly candidateGenerator: CandidateGenerator;
  private readonly rankingEngine: RankingEngine;
  private readonly suppressionStore: SuppressionStore;
  private readonly suppressionEngine: SuppressionEngine;
  private readonly feedbackStore: FeedbackStore;
  private readonly acceptanceRouter: AcceptanceRouter;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: NudgeDiscoveryServiceOptions) {
    this.store = options.store;
    this.registryService = options.registryService;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.rankingPolicyStore =
      options.rankingPolicyStore ??
      new RankingPolicyStore(this.store, { now: this.now });
    this.signalRecorder =
      options.signalRecorder ??
      new SignalRecorder(this.store, {
        now: this.now,
        idFactory: this.idFactory,
      });
    this.candidateGenerator =
      options.candidateGenerator ?? new CandidateGenerator({ now: this.now });
    this.suppressionStore =
      options.suppressionStore ?? new SuppressionStore(this.store);
    this.rankingEngine =
      options.rankingEngine ??
      new RankingEngine({
        rankingPolicyStore: this.rankingPolicyStore,
        now: this.now,
        idFactory: this.idFactory,
      });
    this.suppressionEngine =
      options.suppressionEngine ??
      new SuppressionEngine({
        suppressionStore: this.suppressionStore,
        now: this.now,
      });
    this.feedbackStore = options.feedbackStore ?? new FeedbackStore(this.store);
    this.acceptanceRouter = options.acceptanceRouter ?? new AcceptanceRouter();
  }

  async recordSignal(input: NudgeSignalRecordInput): Promise<NudgeSignalRecord> {
    return this.signalRecorder.record(input);
  }

  async generateCandidates(
    input: NudgeCandidateGenerationInput,
  ): Promise<NudgeCandidateGenerationResult> {
    return this.candidateGenerator.generate(input);
  }

  async rankCandidates(input: NudgeRankingRequest): Promise<NudgeRankingResult> {
    return this.rankingEngine.rank(input);
  }

  async evaluateSuppression(
    input: NudgeSuppressionCheckRequest,
  ): Promise<NudgeSuppressionCheckResult> {
    return this.suppressionEngine.evaluate(input);
  }

  async recordDelivery(
    input: NudgeDeliveryRecordInput,
  ): Promise<NudgeDeliveryRecord> {
    const parsed = NudgeDeliveryRecordInputSchema.parse(input);
    return this.store.saveDelivery(
      NudgeDeliveryRecordSchema.parse({
        delivery_id: this.idFactory(),
        ...parsed,
      }),
    );
  }

  async recordFeedback(
    input: NudgeFeedbackRecordInput,
  ): Promise<NudgeFeedbackRecord> {
    const parsed = NudgeFeedbackRecordInputSchema.parse(input);
    return this.feedbackStore.save(
      NudgeFeedbackRecordSchema.parse({
        feedback_id: this.idFactory(),
        ...parsed,
      }),
    );
  }

  async routeAcceptance(
    input: NudgeAcceptanceRouteRequest,
  ): Promise<NudgeAcceptanceRouteResult> {
    return this.acceptanceRouter.route(input);
  }

  async prepareSurfaceFeed(
    input: MarketplaceNudgeFeedRequest,
  ): Promise<MarketplaceNudgeFeedSnapshot> {
    const parsed = MarketplaceNudgeFeedRequestSchema.parse(input);
    await this.ensureDefaultPolicy();
    if (!this.registryService) {
      return MarketplaceNudgeFeedSnapshotSchema.parse({
        projectId: parsed.projectId,
        surface: parsed.surface,
        cards: [],
        blockedDeliveries: [],
        generatedAt: this.now(),
      });
    }

    const signals = await this.resolveSignals(parsed.signalRefs);
    const query = this.resolveBrowseQuery(parsed.signalRefs);
    const browse = await this.registryService.listPackages({
      query,
      trustTiers: [],
      distributionStatuses: [],
      compatibilityStates: [],
      page: 1,
      pageSize: Math.max(parsed.limit, 5),
      projectId: parsed.projectId,
    });

    const candidates: Array<{
      envelope: NudgeCandidateEnvelope;
      features: NudgeRankingFeatureInput;
      trustEligibility:
        | (typeof browse.items)[number]['trustEligibility']
        | null;
      deepLinks: MarketplaceSurfaceLink[];
      whyThis: string[];
    }> = [];

    for (const item of browse.items.slice(0, parsed.limit)) {
      const evidenceRefs =
        signals.length > 0
          ? mergeEvidenceRefs(...signals.map((signal) => signal.evidence_refs))
          : [DEFAULT_SIGNAL_EVIDENCE_REF];
      const candidateId = stableCandidateId(
        item.package.package_id,
        parsed.projectId,
      );
      const feedback = await this.store.listFeedbackByCandidate(candidateId);
      const blocked =
        item.latestRelease == null ||
        (item.trustEligibility?.block_reason_codes.length ?? 0) > 0 ||
        item.package.distribution_status !== 'active';
      const envelope = NudgeCandidateEnvelopeSchema.parse({
        candidate: {
          candidate_id: candidateId,
          source_type: 'marketplace_package',
          source_ref: item.package.package_id,
          origin_trust_tier: item.package.trust_tier,
          compatibility_state: item.package.compatibility_state,
          target_scope: parsed.projectId ? 'project' : 'global',
          reason_codes: blocked
            ? ['NDG-CANDIDATE-BLOCKED-REGISTRY']
            : ['NDG-CANDIDATE-ELIGIBLE'],
          created_at: this.now(),
        },
        registry_eligibility: item.trustEligibility ?? undefined,
        discovery_explainability: [],
        reason_codes: blocked
          ? ['NDG-CANDIDATE-BLOCKED-REGISTRY']
          : ['NDG-CANDIDATE-ELIGIBLE'],
        evidence_refs: evidenceRefs,
        blocked,
      });

      candidates.push({
        envelope,
        features: {
          relevance: signals.length > 0 ? 0.85 : 0.55,
          expected_outcome_gain: item.package.package_type === 'project' ? 0.75 : 0.6,
          trust_confidence: trustScore(item.package.trust_tier),
          compatibility_confidence: compatibilityScore(
            item.package.compatibility_state,
          ),
          novelty: feedback.length === 0 ? 0.7 : 0.35,
          fatigue_penalty: Math.min(feedback.length * 0.1, 0.5),
          risk_penalty:
            item.package.distribution_status === 'active' &&
            item.package.compatibility_state === 'compatible'
              ? 0.05
              : 0.35,
        },
        trustEligibility: item.trustEligibility ?? null,
        deepLinks: item.deepLinks,
        whyThis: this.buildWhyThis(item.package.display_name, signals, parsed.signalRefs),
      });
    }

    if (candidates.length === 0) {
      return MarketplaceNudgeFeedSnapshotSchema.parse({
        projectId: parsed.projectId,
        surface: parsed.surface,
        cards: [],
        blockedDeliveries: [],
        generatedAt: this.now(),
      });
    }

    const ranking = await this.rankCandidates({
      candidates: candidates.map((candidate) => ({
        envelope: candidate.envelope,
        features: candidate.features,
      })),
      surface: parsed.surface,
      ranked_at: this.now(),
    });

    const cards: MarketplaceNudgeFeedSnapshot['cards'] = [];
    const blockedDeliveries: NudgeDeliveryRecord[] = [];

    for (const ranked of ranking.decisions.slice(0, parsed.limit)) {
      const candidateInput = candidates.find(
        (entry) =>
          entry.envelope.candidate.candidate_id ===
          ranked.decision.candidate_id,
      );
      if (!candidateInput) {
        continue;
      }

      const suppression = await this.evaluateSuppression({
        candidate: candidateInput.envelope.candidate,
        surface: parsed.surface,
        requesting_project_id: parsed.projectId,
        evidence_refs: candidateInput.envelope.evidence_refs,
        checked_at: this.now(),
      });
      const deliverable = ranked.deliverable && !suppression.blocked;
      const delivery = await this.recordDelivery({
        candidate_id: ranked.decision.candidate_id,
        decision_id: ranked.decision.decision_id,
        surface: parsed.surface,
        outcome: deliverable ? 'delivered' : 'delivery_blocked',
        reason_codes: [
          ...new Set([...ranked.reason_codes, ...suppression.reason_codes]),
        ],
        evidence_refs: mergeEvidenceRefs(
          ranked.evidence_refs,
          suppression.evidence_refs,
        ),
        delivered_at: this.now(),
      });

      if (deliverable) {
        cards.push({
          candidate: candidateInput.envelope.candidate,
          decision: ranked.decision,
          delivery,
          trustEligibility: candidateInput.trustEligibility,
          whyThis: candidateInput.whyThis,
          availableSuppressionActions: [
            'dismiss_once',
            'snooze',
            'mute_category',
            'mute_project',
            'mute_global',
          ],
          activeSuppressions: suppression.matched_suppressions,
          deepLinks: candidateInput.deepLinks,
        });
      } else {
        blockedDeliveries.push(delivery);
      }
    }

    return MarketplaceNudgeFeedSnapshotSchema.parse({
      projectId: parsed.projectId,
      surface: parsed.surface,
      cards,
      blockedDeliveries,
      generatedAt: this.now(),
    });
  }

  async applySuppression(
    input: NudgeSuppressionMutationInput,
  ): Promise<NudgeSuppressionRecord> {
    const parsed = NudgeSuppressionMutationInputSchema.parse(input);
    const occurredAt = parsed.occurredAt ?? this.now();
    const reasonCode = mapSuppressionReasonCode(parsed.action);
    const suppression = await this.suppressionStore.save(
      NudgeSuppressionRecordSchema.parse({
        suppression_id: this.idFactory(),
        action: parsed.action,
        scope: parsed.scope,
        target_ref: parsed.targetRef,
        requesting_project_id: parsed.projectId,
        surface_set: [parsed.surface],
        reason_codes: [reasonCode],
        evidence_refs: parsed.evidenceRefs,
        created_at: occurredAt,
        expires_at:
          parsed.action === 'snooze' && parsed.durationMinutes
            ? new Date(
                new Date(occurredAt).getTime() +
                  parsed.durationMinutes * 60_000,
              ).toISOString()
            : undefined,
      }),
    );

    await this.feedbackStore.save(
      NudgeFeedbackRecordSchema.parse({
        feedback_id: this.idFactory(),
        candidate_id: parsed.candidateId,
        decision_id: parsed.decisionId,
        event_type: mapFeedbackEvent(parsed.action),
        surface: parsed.surface,
        occurred_at: occurredAt,
        evidence_refs: parsed.evidenceRefs,
      }),
    );

    return suppression;
  }

  async listSuppressions(
    input: NudgeSuppressionQuery,
  ): Promise<NudgeSuppressionQueryResult> {
    const parsed = NudgeSuppressionQuerySchema.parse(input);
    const suppressions = (await this.suppressionStore.list()).filter((record) => {
      if (parsed.projectId && record.requesting_project_id !== parsed.projectId) {
        return false;
      }
      if (
        parsed.surface &&
        record.surface_set.length > 0 &&
        !record.surface_set.includes(parsed.surface)
      ) {
        return false;
      }
      if (parsed.scope && record.scope !== parsed.scope) {
        return false;
      }
      if (
        parsed.candidateId &&
        !(record.scope === 'candidate' && record.target_ref === parsed.candidateId)
      ) {
        return false;
      }
      return true;
    });

    return NudgeSuppressionQueryResultSchema.parse({
      suppressions,
      generatedAt: this.now(),
    });
  }

  async getRankingPolicy(policyVersion?: string): Promise<NudgeRankingPolicy> {
    const policy = await this.rankingPolicyStore.getPolicy(policyVersion);
    if (!policy) {
      throw new Error(
        `Ranking policy not found or inactive: ${policyVersion ?? 'current'}`,
      );
    }
    return policy;
  }

  private async resolveSignals(signalRefs: readonly string[]) {
    if (signalRefs.length === 0) {
      return [];
    }

    const knownSignals = await this.store.listSignals();
    return knownSignals.filter(
      (signal) =>
        signalRefs.includes(signal.signal_id) ||
        signal.source_refs.some((sourceRef) => signalRefs.includes(sourceRef)),
    );
  }

  private resolveBrowseQuery(signalRefs: readonly string[]): string {
    return signalRefs.find((ref) => /[a-z]/i.test(ref)) ?? '';
  }

  private buildWhyThis(
    displayName: string,
    signals: ReadonlyArray<NudgeSignalRecord>,
    signalRefs: readonly string[],
  ): string[] {
    if (signals.length > 0) {
      return signals.map(
        (signal) => `${displayName} matches ${signal.signal_type.replaceAll('_', ' ')}`,
      );
    }
    if (signalRefs.length > 0) {
      return [`Matched advisory context from ${signalRefs[0]}`];
    }
    return [`Suggested from canonical marketplace discovery signals for ${displayName}`];
  }

  private async ensureDefaultPolicy(): Promise<void> {
    const existing = await this.rankingPolicyStore.getPolicy();
    if (existing) {
      return;
    }

    await this.rankingPolicyStore.save({
      policy_id: this.idFactory(),
      version: '2026.03.10.default',
      scoring_weights: {
        relevance: 0.4,
        expected_outcome_gain: 0.2,
        trust_confidence: 0.1,
        compatibility_confidence: 0.1,
        novelty: 0.15,
        fatigue_penalty: 0.03,
        risk_penalty: 0.02,
      },
      approval_evidence_ref: 'approval:phase-10.2-default-policy',
      witness_ref: 'witness:phase-10.2-default-policy',
      effective_at: this.now(),
    });
  }
}
