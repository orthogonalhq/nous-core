import type {
  NudgeCandidateEnvelope,
  NudgeCandidateGenerationInput,
  NudgeCandidateGenerationResult,
  NudgeCandidateSeed,
  NudgeReasonCode,
} from '@nous/shared';
import {
  NudgeCandidateEnvelopeSchema,
  NudgeCandidateGenerationInputSchema,
  NudgeCandidateGenerationResultSchema,
} from '@nous/shared';

export interface CandidateGeneratorOptions {
  now?: () => string;
}

function uniqueReasonCodes(codes: NudgeReasonCode[]): NudgeReasonCode[] {
  return [...new Set(codes)];
}

function resolveReasonCodes(seed: NudgeCandidateSeed): {
  blocked: boolean;
  reasonCodes: NudgeReasonCode[];
} {
  const reasonCodes: NudgeReasonCode[] = [];
  let blocked = seed.blocked ?? false;

  if ((seed.discovery_policy?.deniedProjectCount ?? 0) > 0) {
    blocked = true;
    reasonCodes.push('NDG-CANDIDATE-BLOCKED-POLICY-DENIAL');
  }

  if (seed.registry_eligibility) {
    if (
      seed.registry_eligibility.compatibility_state === 'blocked_incompatible' ||
      seed.registry_eligibility.block_reason_codes.includes('MKT-007-COMPATIBILITY_BLOCKED')
    ) {
      blocked = true;
      reasonCodes.push('NDG-CANDIDATE-BLOCKED-COMPATIBILITY');
    }

    if (
      seed.registry_eligibility.block_reason_codes.length > 0 ||
      seed.registry_eligibility.distribution_status !== 'active' ||
      !seed.registry_eligibility.metadata_valid ||
      !seed.registry_eligibility.signer_valid
    ) {
      blocked = true;
      reasonCodes.push('NDG-CANDIDATE-BLOCKED-REGISTRY');
    }
  }

  if (!blocked) {
    reasonCodes.push('NDG-CANDIDATE-ELIGIBLE');
  }

  return {
    blocked,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

export class CandidateGenerator {
  private readonly now: () => string;

  constructor(options: CandidateGeneratorOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async generate(
    input: NudgeCandidateGenerationInput,
  ): Promise<NudgeCandidateGenerationResult> {
    const parsed = NudgeCandidateGenerationInputSchema.parse(input);
    const candidates = parsed.seeds.map((seed): NudgeCandidateEnvelope => {
      const { blocked, reasonCodes } = resolveReasonCodes(seed);
      return NudgeCandidateEnvelopeSchema.parse({
        candidate: seed.candidate,
        registry_eligibility: seed.registry_eligibility,
        discovery_explainability: seed.discovery_explainability,
        reason_codes: reasonCodes,
        evidence_refs: seed.evidence_refs,
        blocked,
      });
    });

    return NudgeCandidateGenerationResultSchema.parse({
      signal_id: parsed.signal.signal_id,
      candidates,
      generated_at: this.now(),
    });
  }
}
