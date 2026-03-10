import { randomUUID } from 'node:crypto';
import type {
  INudgeDiscoveryService,
  NudgeAcceptanceRouteRequest,
  NudgeAcceptanceRouteResult,
  NudgeCandidateGenerationInput,
  NudgeCandidateGenerationResult,
  NudgeDeliveryRecord,
  NudgeDeliveryRecordInput,
  NudgeFeedbackRecord,
  NudgeFeedbackRecordInput,
  NudgeRankingPolicy,
  NudgeRankingRequest,
  NudgeRankingResult,
  NudgeSignalRecord,
  NudgeSignalRecordInput,
  NudgeSuppressionCheckRequest,
  NudgeSuppressionCheckResult,
} from '@nous/shared';
import {
  NudgeDeliveryRecordInputSchema,
  NudgeDeliveryRecordSchema,
  NudgeFeedbackRecordInputSchema,
  NudgeFeedbackRecordSchema,
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

export class NudgeDiscoveryService implements INudgeDiscoveryService {
  private readonly store: DocumentNudgeStore;
  private readonly rankingPolicyStore: RankingPolicyStore;
  private readonly signalRecorder: SignalRecorder;
  private readonly candidateGenerator: CandidateGenerator;
  private readonly rankingEngine: RankingEngine;
  private readonly suppressionEngine: SuppressionEngine;
  private readonly feedbackStore: FeedbackStore;
  private readonly acceptanceRouter: AcceptanceRouter;
  private readonly now: () => string;
  private readonly idFactory: () => string;

  constructor(options: NudgeDiscoveryServiceOptions) {
    this.store = options.store;
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
    const suppressionStore =
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
        suppressionStore,
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

  async getRankingPolicy(policyVersion?: string): Promise<NudgeRankingPolicy> {
    const policy = await this.rankingPolicyStore.getPolicy(policyVersion);
    if (!policy) {
      throw new Error(
        `Ranking policy not found or inactive: ${policyVersion ?? 'current'}`,
      );
    }
    return policy;
  }
}
