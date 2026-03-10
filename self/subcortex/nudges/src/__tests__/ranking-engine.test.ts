import type {
  ConfidenceGovernanceEvaluationInput,
  ConfidenceGovernanceEvaluationResult,
  EscalationDecision,
  EscalationSituation,
  IPfcEngine,
  MemoryEntryId,
  NudgeRankingRequest,
  PfcDecision,
  ProjectId,
  ReflectionContext,
  ReflectionResult,
  TraceEvidenceReference,
} from '@nous/shared';
import { describe, expect, it } from 'vitest';
import { DocumentNudgeStore } from '../document-nudge-store.js';
import { RankingEngine } from '../ranking-engine.js';
import { RankingPolicyStore } from '../ranking-policy-store.js';
import { createMemoryDocumentStore } from './test-store.js';

const NOW = '2026-03-10T00:00:00.000Z';
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440301' as ProjectId;
const EVIDENCE_REF = {
  actionCategory: 'trace-persist',
  authorizationEventId: '550e8400-e29b-41d4-a716-446655440101',
} as unknown as TraceEvidenceReference;
const PATTERN_ID = '550e8400-e29b-41d4-a716-446655440401' as MemoryEntryId;
const BASED_ON_ID = '550e8400-e29b-41d4-a716-446655440402' as MemoryEntryId;

class FakePfcEngine implements IPfcEngine {
  constructor(private readonly result: ConfidenceGovernanceEvaluationResult) {}

  async evaluateConfidenceGovernance(
    _input: ConfidenceGovernanceEvaluationInput,
  ): Promise<ConfidenceGovernanceEvaluationResult> {
    return this.result;
  }

  async evaluateMemoryWrite(): Promise<PfcDecision> {
    throw new Error('not used');
  }

  async evaluateMemoryMutation(): Promise<PfcDecision> {
    throw new Error('not used');
  }

  async evaluateToolExecution(): Promise<PfcDecision> {
    throw new Error('not used');
  }

  async reflect(_output: unknown, _context: ReflectionContext): Promise<ReflectionResult> {
    throw new Error('not used');
  }

  async evaluateEscalation(_situation: EscalationSituation): Promise<EscalationDecision> {
    throw new Error('not used');
  }

  getTier() {
    return 1;
  }
}

async function createPolicyStore() {
  const store = new DocumentNudgeStore(createMemoryDocumentStore());
  const policyStore = new RankingPolicyStore(store, { now: () => NOW });
  await policyStore.save({
    policy_id: '550e8400-e29b-41d4-a716-446655440201',
    version: '2026.03.10',
    scoring_weights: {
      relevance: 0.4,
      expected_outcome_gain: 0.2,
      trust_confidence: 0.1,
      compatibility_confidence: 0.1,
      novelty: 0.15,
      fatigue_penalty: 0.03,
      risk_penalty: 0.02,
    },
    approval_evidence_ref: 'approval:1',
    witness_ref: 'witness:1',
    effective_at: NOW,
  });
  return policyStore;
}

function buildRequest(): NudgeRankingRequest {
  return {
    surface: 'discovery_card',
    policy_version: '2026.03.10',
    candidates: [
      {
        envelope: {
          candidate: {
            candidate_id: 'candidate-1',
            source_type: 'marketplace_package',
            source_ref: 'pkg.persona-engine',
            origin_trust_tier: 'verified_maintainer',
            compatibility_state: 'compatible',
            target_scope: 'project',
            reason_codes: ['registry-compatible'],
            created_at: NOW,
          },
          discovery_explainability: [],
          reason_codes: ['NDG-CANDIDATE-ELIGIBLE'],
          evidence_refs: [EVIDENCE_REF],
          blocked: false,
        },
        features: {
          relevance: 0.8,
          expected_outcome_gain: 0.5,
          trust_confidence: 0.9,
          compatibility_confidence: 0.9,
          novelty: 0.4,
          fatigue_penalty: 0.1,
          risk_penalty: 0.05,
        },
      },
    ],
  };
}

const CONFIDENCE_RESULT: ConfidenceGovernanceEvaluationResult = {
  outcome: 'allow_with_flag',
  reasonCode: 'CGR-ALLOW-WITH-FLAG',
  governance: 'should',
  actionCategory: 'trace-persist',
  patternId: PATTERN_ID,
  confidence: 0.8,
  confidenceTier: 'medium',
  supportingSignals: 8,
  autonomyAllowed: false,
  requiresConfirmation: false,
  highRiskOverrideApplied: false,
  evidenceRefs: [EVIDENCE_REF],
  explanation: {
    patternId: PATTERN_ID,
    outcomeRef: 'candidate-1',
    evidenceRefs: [EVIDENCE_REF],
  },
};

describe('RankingEngine', () => {
  it('computes weighted scores and marks deliverable candidates', async () => {
    const policyStore = await createPolicyStore();
    const engine = new RankingEngine({
      rankingPolicyStore: policyStore,
      now: () => NOW,
      idFactory: (() => {
        let sequence = 0;
        return () => `decision-${++sequence}`;
      })(),
      pfcEngine: new FakePfcEngine(CONFIDENCE_RESULT),
    });

    const result = await engine.rank({
      ...buildRequest(),
      candidates: [
        {
          ...buildRequest().candidates[0],
          confidence_governance_input: {
            governance: 'should',
            actionCategory: 'trace-persist',
            projectControlState: 'running',
            pattern: {
              id: PATTERN_ID,
              content: 'Use a maintained package',
              confidence: 0.8,
              basedOn: [BASED_ON_ID],
              supersedes: [],
              evidenceRefs: [EVIDENCE_REF],
              scope: 'project',
              tags: ['nudge'],
              createdAt: NOW,
              updatedAt: NOW,
              projectId: PROJECT_ID,
            },
            confidenceSignal: {
              tier: 'medium',
              confidence: 0.8,
              supportingSignals: 8,
              patternId: PATTERN_ID,
            },
            explanation: {
              patternId: PATTERN_ID,
              outcomeRef: 'candidate-1',
              evidenceRefs: [EVIDENCE_REF],
            },
          },
        },
      ],
    });

    expect(result.policy.version).toBe('2026.03.10');
    expect(result.decisions[0].components.final_score).toBeCloseTo(0.656, 3);
    expect(result.decisions[0].deliverable).toBe(true);
  });

  it('fails closed when the requested policy is missing', async () => {
    const policyStore = await createPolicyStore();
    const engine = new RankingEngine({
      rankingPolicyStore: policyStore,
      now: () => NOW,
    });

    await expect(
      engine.rank({
        ...buildRequest(),
        policy_version: 'missing',
      }),
    ).rejects.toThrow('Ranking policy not found or inactive');
  });
});
