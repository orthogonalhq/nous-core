/**
 * Phase 4.4: Confidence tier mapping verification.
 * Asserts no MAY autonomy without high tier + MAY node; no opaque autonomy path.
 */
import { describe, it, expect } from 'vitest';
import {
  CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING,
  ConfidenceTierSchema,
} from '../types/confidence-governance.js';

describe('Phase 4.4 confidence tier mapping', () => {
  it('mayAutonomyAllowed is true only for high tier', () => {
    for (const mapping of CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING) {
      if (mapping.tier === 'high') {
        expect(mapping.mayAutonomyAllowed).toBe(true);
      } else {
        expect(mapping.mayAutonomyAllowed).toBe(false);
      }
    }
  });

  it('maxGovernanceForAutonomy is may only for high tier', () => {
    for (const mapping of CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING) {
      if (mapping.tier === 'high') {
        expect(mapping.maxGovernanceForAutonomy).toBe('may');
      } else {
        expect(mapping.maxGovernanceForAutonomy).toBeUndefined();
      }
    }
  });

  it('medium remains the canonical allow_with_flag tier via shouldFlagDeviations', () => {
    const medium = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'medium',
    );
    const high = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'high',
    );

    expect(medium?.shouldFlagDeviations).toBe(true);
    expect(high?.shouldFlagDeviations).toBe(false);
  });

  it('low and medium never grant mayAutonomyAllowed (regression)', () => {
    const low = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'low',
    );
    const medium = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'medium',
    );
    expect(low?.mayAutonomyAllowed).toBe(false);
    expect(medium?.mayAutonomyAllowed).toBe(false);
  });

  it('all tiers are valid ConfidenceTier', () => {
    for (const mapping of CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING) {
      expect(ConfidenceTierSchema.safeParse(mapping.tier).success).toBe(true);
    }
  });
});
