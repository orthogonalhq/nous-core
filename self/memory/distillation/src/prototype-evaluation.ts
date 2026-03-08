import {
  DistillationEvaluationResultSchema,
  DistillationPrototypeCandidateSummarySchema,
  DistillationPrototypeProposalSchema,
  DistillationPrototypeSuiteEvaluationSchema,
  type DistillationEvaluationResult,
  type DistillationPrototypeCandidate,
  type DistillationPrototypeCandidateSummary,
  type DistillationPrototypeRecommendation,
  type DistillationPrototypeScenario,
  type DistillationPrototypeSuiteEvaluation,
  sortMemoryEntryIds,
} from './prototype-contracts.js';

function hasAnyKeyword(content: string, keywords: string[]): boolean {
  return keywords.some((keyword) => content.includes(keyword));
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export async function evaluatePrototypeScenario(
  candidate: DistillationPrototypeCandidate,
  scenario: DistillationPrototypeScenario,
): Promise<DistillationEvaluationResult> {
  const proposal = DistillationPrototypeProposalSchema.parse(
    await candidate.propose(scenario),
  );
  const sourceIds = sortMemoryEntryIds(
    scenario.cluster.records.map((record) => record.id),
  );
  const proposalIds = sortMemoryEntryIds(proposal.basedOn);
  const explanationText = [proposal.content, ...proposal.rationale]
    .join(' ')
    .toLowerCase();

  const correctness =
    proposal.candidateId === candidate.id &&
    proposal.scenarioId === scenario.id &&
    proposal.promotionDecision === scenario.expected.promotionDecision &&
    proposal.contradictionStatus === scenario.expected.contradictionStatus &&
    proposal.stalenessStatus === scenario.expected.stalenessStatus
      ? 'pass'
      : 'fail';

  const explainabilityPass =
    proposal.content.trim().length > 0 &&
    proposal.rationale.length > 0 &&
    (proposal.contradictionStatus === 'none' ||
      hasAnyKeyword(explanationText, [
        'contradiction',
        'mixed-signal',
        'mixed signal',
      ])) &&
    (proposal.stalenessStatus === 'fresh' ||
      hasAnyKeyword(explanationText, ['stale', 'aging'])) &&
    (proposal.promotionDecision === 'promote' ||
      hasAnyKeyword(explanationText, ['hold', 'reject']));

  const traceabilityPass =
    arraysEqual(proposalIds, sourceIds) &&
    proposal.evidenceRefs.length > 0 &&
    (proposal.supersessionEligible
      ? arraysEqual(sortMemoryEntryIds(proposal.supersedes), sourceIds) &&
        proposal.promotionDecision === 'promote'
      : proposal.supersedes.length === 0 &&
        proposal.promotionDecision !== 'promote');

  const contradictionHandlingPass =
    proposal.contradictionStatus === scenario.expected.contradictionStatus &&
    (!scenario.expected.requiresSupersessionBlockOnFailure ||
      scenario.expected.contradictionStatus !== 'blocking' ||
      (proposal.promotionDecision !== 'promote' &&
        proposal.supersessionEligible === false));

  const stalenessBehaviorPass =
    proposal.stalenessStatus === scenario.expected.stalenessStatus &&
    (proposal.stalenessStatus !== 'stale' ||
      proposal.promotionDecision !== 'promote');

  const verdict = {
    correctness,
    explainability: explainabilityPass ? 'pass' : 'fail',
    traceability: traceabilityPass ? 'pass' : 'fail',
    contradictionHandling: contradictionHandlingPass ? 'pass' : 'fail',
    stalenessBehavior: stalenessBehaviorPass ? 'pass' : 'fail',
  } as const;

  const failureReasons = Object.entries(verdict)
    .filter(([, status]) => status === 'fail')
    .map(([dimension]) => `${candidate.id}:${scenario.id}:${dimension}`);

  return DistillationEvaluationResultSchema.parse({
    candidateId: candidate.id,
    baselineCandidateId: 'baseline-current-engine',
    scenarioId: scenario.id,
    verdict,
    overallDecision: failureReasons.length === 0 ? 'go' : 'no-go',
    failureReasons,
  });
}

export async function summarizePrototypeCandidate(
  candidate: DistillationPrototypeCandidate,
  scenarios: DistillationPrototypeScenario[],
): Promise<DistillationPrototypeCandidateSummary> {
  const scenarioResults: DistillationEvaluationResult[] = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await evaluatePrototypeScenario(candidate, scenario));
  }

  const passCount = scenarioResults.filter(
    (result) => result.overallDecision === 'go',
  ).length;
  const failCount = scenarioResults.length - passCount;

  return DistillationPrototypeCandidateSummarySchema.parse({
    candidateId: candidate.id,
    scenarioResults,
    passCount,
    failCount,
    overallDecision: failCount === 0 ? 'go' : 'no-go',
  });
}

function compareCandidateSummaries(
  left: DistillationPrototypeCandidateSummary,
  right: DistillationPrototypeCandidateSummary,
): number {
  if (left.failCount !== right.failCount) {
    return left.failCount - right.failCount;
  }

  if (left.passCount !== right.passCount) {
    return right.passCount - left.passCount;
  }

  const leftPriority = left.candidateId === 'baseline-current-engine' ? 1 : 0;
  const rightPriority = right.candidateId === 'baseline-current-engine' ? 1 : 0;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.candidateId.localeCompare(right.candidateId);
}

function buildRecommendation(
  summaries: DistillationPrototypeCandidateSummary[],
): DistillationPrototypeRecommendation {
  const ranked = [...summaries].sort(compareCandidateSummaries);
  const viable = ranked.find((summary) => summary.overallDecision === 'go');
  if (!viable) {
    const bestAttempt = ranked[0];
    return {
      decision: 'no-go',
      rationale: [
        'No prototype candidate satisfied every required evaluation dimension.',
        `${bestAttempt.candidateId} is the least-bad candidate but still failed ${bestAttempt.failCount} scenario(s).`,
      ],
    };
  }

  return {
    decision: 'go',
    recommendedCandidateId: viable.candidateId,
    rationale: [
      `${viable.candidateId} passed every prototype scenario with deterministic verdicts.`,
      `Recommendation is based on ${viable.passCount} passing scenario evaluations and zero blocking failures.`,
    ],
  };
}

export async function evaluatePrototypeSuite(
  candidates: DistillationPrototypeCandidate[],
  scenarios: DistillationPrototypeScenario[],
): Promise<DistillationPrototypeSuiteEvaluation> {
  const summaries: DistillationPrototypeCandidateSummary[] = [];
  for (const candidate of candidates) {
    summaries.push(await summarizePrototypeCandidate(candidate, scenarios));
  }

  return DistillationPrototypeSuiteEvaluationSchema.parse({
    summaries,
    recommendation: buildRecommendation(summaries),
  });
}
