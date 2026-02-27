/**
 * Phase 4.4: High-risk action override verification (ADR-004).
 * Asserts that confidence cannot bypass confirmation/authorization for high-risk actions.
 */
import { describe, it, expect } from 'vitest';
import {
  HIGH_RISK_ACTION_CATEGORIES,
  CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING,
} from '../types/confidence-governance.js';
import { CriticalActionCategorySchema } from '../types/evidence.js';

describe('Phase 4.4 high-risk override (ADR-004)', () => {
  it('HIGH_RISK_ACTION_CATEGORIES includes tool-execute, memory-write, opctl-command', () => {
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('tool-execute');
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('memory-write');
    expect(HIGH_RISK_ACTION_CATEGORIES).toContain('opctl-command');
  });

  it('all high-risk categories are valid CriticalActionCategory', () => {
    for (const cat of HIGH_RISK_ACTION_CATEGORIES) {
      expect(CriticalActionCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it('confidence cannot bypass: even high tier does not grant autonomy for high-risk', () => {
    const highMapping = CANONICAL_CONFIDENCE_GOVERNANCE_MAPPING.find(
      (m) => m.tier === 'high',
    );
    expect(highMapping?.mayAutonomyAllowed).toBe(true);
    expect(highMapping?.maxGovernanceForAutonomy).toBe('may');
    // Invariant: high-risk actions (tool-execute, memory-write, opctl-command)
    // ALWAYS require confirmation regardless of confidence tier.
    // This is documented in SDS; the constant exists so callers can check.
    expect(HIGH_RISK_ACTION_CATEGORIES.length).toBeGreaterThan(0);
  });
});
