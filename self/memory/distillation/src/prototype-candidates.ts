import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { ExperienceRecord } from '@nous/shared';
import { computeInitialConfidence } from './confidence.js';
import { DistillationEngine } from './distillation-engine.js';
import {
  DEFAULT_PROTOTYPE_EVALUATION_REFERENCE_AT,
  DistillationPrototypeProposalSchema,
  type DistillationPrototypeCandidate,
  type DistillationPrototypeProposal,
  type DistillationPrototypeScenario,
  type PrototypeContradictionStatus,
  type PrototypePromotionDecision,
  type PrototypeSignalAnalysis,
  type PrototypeStalenessStatus,
  createSyntheticEvidenceRefs,
  sortClusterRecords,
  sortMemoryEntryIds,
} from './prototype-contracts.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function sentimentClass(sentiment: ExperienceRecord['sentiment']) {
  if (sentiment === 'strong-positive' || sentiment === 'weak-positive') {
    return 'positive';
  }

  if (sentiment === 'strong-negative' || sentiment === 'weak-negative') {
    return 'negative';
  }

  return 'neutral';
}

function getLatestAgeDays(
  records: ExperienceRecord[],
  referenceAt: string = DEFAULT_PROTOTYPE_EVALUATION_REFERENCE_AT,
): number {
  const latestUpdatedAt = Math.max(
    ...records.map((record) => Date.parse(record.updatedAt)),
  );
  const diffMs = Date.parse(referenceAt) - latestUpdatedAt;
  return Math.max(0, Math.floor(diffMs / DAY_MS));
}

function determineContradictionStatus(
  positiveCount: number,
  negativeCount: number,
): PrototypeContradictionStatus {
  if (positiveCount === 0 || negativeCount === 0) {
    return 'none';
  }

  const total = positiveCount + negativeCount;
  const dominantRatio = Math.max(positiveCount, negativeCount) / total;
  if (dominantRatio < 0.6) {
    return 'blocking';
  }

  return 'detected';
}

function determineStalenessStatus(
  latestAgeDays: number,
  evaluationWindowDays: number,
): PrototypeStalenessStatus {
  if (latestAgeDays > evaluationWindowDays) {
    return 'stale';
  }

  if (latestAgeDays > Math.floor(evaluationWindowDays / 2)) {
    return 'aging';
  }

  return 'fresh';
}

function determinePromotionDecision(
  contradictionStatus: PrototypeContradictionStatus,
  stalenessStatus: PrototypeStalenessStatus,
): PrototypePromotionDecision {
  if (contradictionStatus === 'blocking') {
    return 'reject';
  }

  if (contradictionStatus === 'detected' || stalenessStatus !== 'fresh') {
    return 'hold';
  }

  return 'promote';
}

function analyzeScenario(
  scenario: DistillationPrototypeScenario,
): PrototypeSignalAnalysis {
  const records = sortClusterRecords(scenario.cluster);
  const positiveCount = records.filter(
    (record) => sentimentClass(record.sentiment) === 'positive',
  ).length;
  const negativeCount = records.filter(
    (record) => sentimentClass(record.sentiment) === 'negative',
  ).length;
  const neutralCount = records.length - positiveCount - negativeCount;
  const latestAgeDays = getLatestAgeDays(records);
  const contradictionStatus = determineContradictionStatus(
    positiveCount,
    negativeCount,
  );
  const stalenessStatus = determineStalenessStatus(
    latestAgeDays,
    scenario.evaluationWindowDays,
  );
  const promotionDecision = determinePromotionDecision(
    contradictionStatus,
    stalenessStatus,
  );

  return {
    basedOn: sortMemoryEntryIds(records.map((record) => record.id)),
    contradictionStatus,
    stalenessStatus,
    promotionDecision,
    supersessionEligible: promotionDecision === 'promote',
    evidenceRefs: createSyntheticEvidenceRefs(records.length),
    positiveCount,
    negativeCount,
    neutralCount,
    latestAgeDays,
  };
}

function adjustConfidence(
  baseConfidence: number,
  contradictionStatus: PrototypeContradictionStatus,
  stalenessStatus: PrototypeStalenessStatus,
): number {
  let adjusted = baseConfidence;

  if (contradictionStatus === 'blocking') {
    adjusted = Math.min(adjusted, 0.25);
  } else if (contradictionStatus === 'detected') {
    adjusted = Math.min(adjusted, 0.59);
  }

  if (stalenessStatus === 'stale') {
    adjusted = Math.min(adjusted, 0.49);
  } else if (stalenessStatus === 'aging') {
    adjusted = Math.min(adjusted, 0.58);
  }

  return Math.round(adjusted * 100) / 100;
}

function dominantSignalLabel(
  analysis: PrototypeSignalAnalysis,
): 'positive' | 'negative' | 'neutral' {
  if (
    analysis.positiveCount >= analysis.negativeCount &&
    analysis.positiveCount >= analysis.neutralCount
  ) {
    return 'positive';
  }

  if (
    analysis.negativeCount >= analysis.positiveCount &&
    analysis.negativeCount >= analysis.neutralCount
  ) {
    return 'negative';
  }

  return 'neutral';
}

function buildStructuredRationale(
  analysis: PrototypeSignalAnalysis,
): string[] {
  const rationale = [
    `Traceability remains complete because all ${analysis.basedOn.length} source record ids remain in basedOn.`,
  ];

  if (analysis.contradictionStatus === 'blocking') {
    rationale.push(
      'Reject because contradiction blocking evidence makes supersession unsafe.',
    );
  } else if (analysis.contradictionStatus === 'detected') {
    rationale.push(
      'Hold because mixed-signal evidence needs additional confirmation before promotion.',
    );
  } else {
    rationale.push(
      'Aligned signals support a promotion-safe summary when freshness is still acceptable.',
    );
  }

  if (analysis.stalenessStatus === 'stale') {
    rationale.push(
      'Hold because stale evidence has exceeded the evaluation window and should not be promoted yet.',
    );
  } else if (analysis.stalenessStatus === 'aging') {
    rationale.push(
      'Hold because aging evidence should be refreshed before promotion or supersession.',
    );
  } else {
    rationale.push('Fresh evidence remains within the evaluation window.');
  }

  rationale.push(
    `Decision is ${analysis.promotionDecision} with supersessionEligible=${String(
      analysis.supersessionEligible,
    )}.`,
  );

  return rationale;
}

export function createBaselineCurrentEngineCandidate(
  engine: DistillationEngine = new DistillationEngine(new InMemoryLtmStore()),
): DistillationPrototypeCandidate {
  return {
    id: 'baseline-current-engine',
    async propose(
      scenario: DistillationPrototypeScenario,
    ): Promise<DistillationPrototypeProposal> {
      const analysis = analyzeScenario(scenario);
      const pattern = await engine.distill(scenario.cluster);

      return DistillationPrototypeProposalSchema.parse({
        candidateId: 'baseline-current-engine',
        scenarioId: scenario.id,
        content: pattern.content,
        basedOn: analysis.basedOn,
        evidenceRefs: pattern.evidenceRefs,
        supersedes: analysis.supersessionEligible ? analysis.basedOn : [],
        proposedConfidence: pattern.confidence,
        promotionDecision: analysis.promotionDecision,
        contradictionStatus: analysis.contradictionStatus,
        stalenessStatus: analysis.stalenessStatus,
        supersessionEligible: analysis.supersessionEligible,
        rationale: [
          'Baseline heuristic output uses the current DistillationEngine compression.',
          analysis.supersessionEligible
            ? 'Baseline output remains promotion eligible under the current heuristic posture.'
            : 'Baseline output requires additional operator review before any promotion decision.',
        ],
      });
    },
  };
}

export function createStructuredSummaryCandidate(): DistillationPrototypeCandidate {
  return {
    id: 'structured-summary-v1',
    async propose(
      scenario: DistillationPrototypeScenario,
    ): Promise<DistillationPrototypeProposal> {
      const analysis = analyzeScenario(scenario);
      const records = sortClusterRecords(scenario.cluster);
      const baseConfidence = computeInitialConfidence(records);
      const proposedConfidence = adjustConfidence(
        baseConfidence,
        analysis.contradictionStatus,
        analysis.stalenessStatus,
      );
      const dominantLabel = dominantSignalLabel(analysis);
      const content = [
        `Signals: ${records.length} records with dominant ${dominantLabel} evidence.`,
        `Contradiction: ${analysis.contradictionStatus}.`,
        `Freshness: ${analysis.stalenessStatus}; latest evidence is ${analysis.latestAgeDays} day(s) old.`,
        `Decision: ${analysis.promotionDecision}.`,
      ].join(' ');

      return DistillationPrototypeProposalSchema.parse({
        candidateId: 'structured-summary-v1',
        scenarioId: scenario.id,
        content,
        basedOn: analysis.basedOn,
        evidenceRefs: analysis.evidenceRefs,
        supersedes: analysis.supersessionEligible ? analysis.basedOn : [],
        proposedConfidence,
        promotionDecision: analysis.promotionDecision,
        contradictionStatus: analysis.contradictionStatus,
        stalenessStatus: analysis.stalenessStatus,
        supersessionEligible: analysis.supersessionEligible,
        rationale: buildStructuredRationale(analysis),
      });
    },
  };
}

export function createDefaultPrototypeCandidates(): DistillationPrototypeCandidate[] {
  return [
    createBaselineCurrentEngineCandidate(),
    createStructuredSummaryCandidate(),
  ];
}
