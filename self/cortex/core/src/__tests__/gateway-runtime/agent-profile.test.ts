import { describe, expect, it } from 'vitest';
import type { AgentClass } from '@nous/shared';
import {
  resolveAgentProfile,
  type AgentProfile,
  type PromptConfig,
} from '../../gateway-runtime/prompt-strategy.js';
import type { PersonalityConfig } from '../../gateway-runtime/personality/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_AGENT_CLASSES: AgentClass[] = [
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
];

const NON_BALANCED_PRESETS: PersonalityConfig['preset'][] = [
  'professional',
  'efficient',
  'thorough',
];

const ALL_PRESETS: PersonalityConfig['preset'][] = [
  'balanced',
  ...NON_BALANCED_PRESETS,
];

const REPRESENTATIVE_OVERRIDE: PersonalityConfig = {
  preset: 'professional',
  overrides: { candor: 'standard' },
};

const CONFIGS_FOR_DIMENSION_ISOLATION: PersonalityConfig[] = [
  ...ALL_PRESETS.map((preset) => ({ preset }) as PersonalityConfig),
  REPRESENTATIVE_OVERRIDE,
];

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests
// ---------------------------------------------------------------------------

describe('resolveAgentProfile — contract tests', () => {
  it.each(ALL_AGENT_CLASSES)(
    'returns all 10 dimensions for %s',
    (agentClass) => {
      const profile: AgentProfile = resolveAgentProfile(agentClass);

      // 4 prompt dimensions
      expect(profile.identity).toBeDefined();
      expect(typeof profile.identity).toBe('string');
      expect(profile.taskFrame).toBeDefined();
      expect(typeof profile.taskFrame).toBe('string');
      expect(profile.toolPolicy).toBeDefined();
      expect(profile.guardrails).toBeDefined();
      expect(Array.isArray(profile.guardrails)).toBe(true);

      // 6 behavioral dimensions (some optional, all present in defaults)
      expect(profile.loopShape).toBeDefined();
      expect(profile.escalationRules).toBeDefined();
      expect(profile.outputContract).toBeDefined();
      expect(profile.contextBudget).toBeDefined();
    },
  );

  it('PromptConfig accepts personalityConfig field (type-level)', () => {
    // Compile-time check: concrete PersonalityConfig satisfies the field type
    // (post-SP 1.2 the field is narrow, not `unknown`).
    const config: PromptConfig = {
      identity: 'test',
      taskFrame: 'test',
      toolPolicy: 'omit',
      guardrails: [],
      personalityConfig: { preset: 'balanced' },
    };
    expect(config.personalityConfig).toEqual({ preset: 'balanced' });
  });

  it('PromptConfig accepts missing personalityConfig (backward compat)', () => {
    const config: PromptConfig = {
      identity: 'test',
      taskFrame: 'test',
      toolPolicy: 'omit',
      guardrails: [],
    };
    expect(config.personalityConfig).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests (R9 split)
// ---------------------------------------------------------------------------

describe('resolveAgentProfile — personality override', () => {
  // Block A — `{ preset: 'balanced' }` byte-identity (T2.5, I2, R9 Block A, Goals C13).
  describe('{ preset: "balanced" } byte-identity (Block A)', () => {
    it.each(ALL_AGENT_CLASSES)(
      '%s: identity strictly equal to no-personality baseline',
      (agentClass) => {
        const balanced = resolveAgentProfile(agentClass, undefined, {
          preset: 'balanced',
        });
        const baseline = resolveAgentProfile(agentClass);
        expect(balanced.identity).toBe(baseline.identity);
      },
    );
  });

  // Block B — non-balanced presets produce a different identity (R9 Block B, Goals C11).
  // Full fragment-concatenation assertions live in
  // `integration-with-apply-personality.test.ts`; this block asserts that
  // agent-profile.test.ts sees a difference at the public surface.
  describe('non-balanced presets produce a different identity (Block B)', () => {
    for (const preset of NON_BALANCED_PRESETS) {
      it.each(ALL_AGENT_CLASSES)(
        `${preset}: %s identity differs from the no-personality baseline`,
        (agentClass) => {
          const withPersonality = resolveAgentProfile(agentClass, undefined, {
            preset,
          });
          const baseline = resolveAgentProfile(agentClass);
          expect(withPersonality.identity).not.toBe(baseline.identity);
        },
      );
    }
  });

  // Block C — mechanical dimensions isolation (T2.3, I4, Goals C15).
  describe('dimension isolation — mechanical', () => {
    for (const config of CONFIGS_FOR_DIMENSION_ISOLATION) {
      const label = config.overrides
        ? `${config.preset} + overrides`
        : config.preset;
      it.each(ALL_AGENT_CLASSES)(
        `${label}: %s preserves mechanical dimensions`,
        (agentClass) => {
          const withPersonality = resolveAgentProfile(
            agentClass,
            undefined,
            config,
          );
          const baseline = resolveAgentProfile(agentClass);
          expect(withPersonality.contextBudget).toEqual(baseline.contextBudget);
          expect(withPersonality.compactionStrategy).toBe(
            baseline.compactionStrategy,
          );
          expect(withPersonality.loopShape).toBe(baseline.loopShape);
          expect(withPersonality.toolConcurrency).toEqual(
            baseline.toolConcurrency,
          );
          expect(withPersonality.escalationRules).toEqual(
            baseline.escalationRules,
          );
        },
      );
    }
  });

  // Block D — guardrails isolation (T2.4, I4, Goals C16).
  describe('dimension isolation — guardrails', () => {
    for (const config of CONFIGS_FOR_DIMENSION_ISOLATION) {
      const label = config.overrides
        ? `${config.preset} + overrides`
        : config.preset;
      it.each(ALL_AGENT_CLASSES)(
        `${label}: %s guardrails deep-equal baseline`,
        (agentClass) => {
          const withPersonality = resolveAgentProfile(
            agentClass,
            undefined,
            config,
          );
          const baseline = resolveAgentProfile(agentClass);
          expect(withPersonality.guardrails).toEqual(baseline.guardrails);
        },
      );
    }
  });

  // Block E — outputContract enum invariance (T2.6, I3, Goals C17).
  describe('outputContract enum invariance', () => {
    for (const config of CONFIGS_FOR_DIMENSION_ISOLATION) {
      const label = config.overrides
        ? `${config.preset} + overrides`
        : config.preset;
      it.each(ALL_AGENT_CLASSES)(
        `${label}: %s outputContract identical to baseline`,
        (agentClass) => {
          const withPersonality = resolveAgentProfile(
            agentClass,
            undefined,
            config,
          );
          const baseline = resolveAgentProfile(agentClass);
          expect(withPersonality.outputContract).toBe(baseline.outputContract);
        },
      );
    }
  });

  // T3.2 edge — null personality routes through the same pre-existing guard
  // as undefined (the `!= null` check on resolveAgentProfile line ~301).
  it('with null/undefined personality: identity unchanged', () => {
    // null is treated as no personality (null == null is falsy for != null check)
    const withNull = resolveAgentProfile(
      'Worker',
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the JS-level guard
      null as any,
    );
    const withUndefined = resolveAgentProfile('Worker');
    expect(withUndefined.identity).toBe(withNull.identity);
  });

  // T2.7 — personalityConfig pass-through by reference on the returned profile
  // (preserves SP 1.1 semantics).
  it('personalityConfig field appears on returned profile when provided', () => {
    const personality: PersonalityConfig = {
      preset: 'professional',
      overrides: { candor: 'standard' },
    };
    const profile = resolveAgentProfile('Worker', undefined, personality);
    expect(profile.personalityConfig).toBe(personality);
  });

  it('personalityConfig is undefined when not provided', () => {
    const profile = resolveAgentProfile('Worker');
    expect(profile.personalityConfig).toBeUndefined();
  });
});

describe('resolveAgentProfile — provider axis', () => {
  it('unknown provider returns same dimensions as default', () => {
    const defaultProfile = resolveAgentProfile('Worker');
    const unknownProvider = resolveAgentProfile('Worker', 'unknown-provider-xyz');
    expect(unknownProvider.loopShape).toBe(defaultProfile.loopShape);
    expect(unknownProvider.outputContract).toBe(defaultProfile.outputContract);
    expect(unknownProvider.escalationRules).toEqual(defaultProfile.escalationRules);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — Edge Case Tests
// ---------------------------------------------------------------------------

describe('resolveAgentProfile — edge cases', () => {
  it.each(ALL_AGENT_CLASSES)(
    '%s returns non-empty identity, taskFrame, and guardrails',
    (agentClass) => {
      const profile = resolveAgentProfile(agentClass);
      expect(profile.identity.length).toBeGreaterThan(0);
      expect(profile.taskFrame.length).toBeGreaterThan(0);
      expect(profile.guardrails.length).toBeGreaterThan(0);
    },
  );
});
