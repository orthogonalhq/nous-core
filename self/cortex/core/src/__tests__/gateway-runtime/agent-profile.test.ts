import { describe, expect, it } from 'vitest';
import type { AgentClass } from '@nous/shared';
import {
  resolveAgentProfile,
  DEFAULT_AGENT_NAME,
  type AgentProfile,
  type PromptConfig,
  type AgentIdentityProjection,
  type UserProfile,
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

// ---------------------------------------------------------------------------
// SP 1.3 — WR-127 dimension isolation under cortex-runtime migration (C25)
// ---------------------------------------------------------------------------
//
// SP 1.2 verified WR-127 dimension isolation at the resolver layer (Block C/D/E
// above). SP 1.3 migrates the Principal/System runtime composition to route
// PersonalityConfig through `resolveAgentProfile`. This describe block proves
// the dimension-isolation invariant survives the call-site migration: for the
// two migrated agent classes (Principal, System), every preset and a
// representative overrides case produce an AgentProfile whose mechanical
// dimensions, guardrails, and outputContract enum value are bit-equal to the
// no-personality baseline.

const MIGRATED_AGENT_CLASSES: AgentClass[] = ['Cortex::Principal', 'Cortex::System'];

// ---------------------------------------------------------------------------
// SP 1.9 Item 2 — Axis A cases 1, 2, 3, 4, 5, 8, 11
// ---------------------------------------------------------------------------
//
// Per Plan Task #15 + SDS § 4.9 Axis A. These cases verify identity-projection
// composition: dimension isolation under projection (case 1), composition
// order (case 2), empty-profile fall-through (case 3), non-default name
// (case 4), non-Principal non-leak (case 5), expertise × personality matrix
// (case 8), and the strengthened-balanced-baseline (case 11).
//
// Axis A discipline: NO `trpc`, React Query, or `ChatPanel` imports. Pure
// identity-composition testing.

const FULL_PROJECTION: AgentIdentityProjection = {
  name: 'Atlas',
  userProfile: {
    displayName: 'Andrew',
    role: 'Principal engineer',
    primaryUseCase: 'Building agent runtimes',
    expertise: 'advanced',
  },
};

const EMPTY_PROJECTION: AgentIdentityProjection = {
  name: DEFAULT_AGENT_NAME,
  userProfile: {},
};

describe('SP 1.9 Item 2 — agent-identity projection (Axis A)', () => {
  // Case 1 — dimension isolation, extended (Goals C16). Mechanical
  // dimensions byte-identical to pre-SP-1.9 even with full projection.
  it('case 1: full projection preserves all mechanical dimensions byte-identical to baseline', () => {
    const baseline = resolveAgentProfile('Cortex::Principal');
    const withProjection = resolveAgentProfile(
      'Cortex::Principal',
      undefined,
      { preset: 'balanced' },
      FULL_PROJECTION,
    );
    expect(withProjection.contextBudget).toEqual(baseline.contextBudget);
    expect(withProjection.compactionStrategy).toBe(baseline.compactionStrategy);
    expect(withProjection.loopShape).toBe(baseline.loopShape);
    expect(withProjection.toolConcurrency).toEqual(baseline.toolConcurrency);
    expect(withProjection.escalationRules).toEqual(baseline.escalationRules);
    expect(withProjection.outputContract).toBe(baseline.outputContract);
    expect(withProjection.guardrails).toEqual(baseline.guardrails);
    expect(withProjection.taskFrame).toBe(baseline.taskFrame);
    expect(withProjection.toolPolicy).toBe(baseline.toolPolicy);
  });

  // Case 2 — composition order (Goals C1 / SDS Note 2). Fragments appear
  // in the binding order: base → agent-name → displayName → role →
  // expertise → primaryUseCase → personality.
  it('case 2: identity fragments appear in binding composition order', () => {
    const profile = resolveAgentProfile(
      'Cortex::Principal',
      undefined,
      { preset: 'balanced' },
      FULL_PROJECTION,
    );
    const id = profile.identity;
    const namePos = id.indexOf('Your name is "Atlas"');
    const displayPos = id.indexOf('preferred name is "Andrew"');
    const rolePos = id.indexOf('role is "Principal engineer"');
    const expertisePos = id.indexOf('expert register');
    const useCasePos = id.indexOf('primary focus is "Building agent runtimes"');
    expect(namePos).toBeGreaterThan(0);
    expect(displayPos).toBeGreaterThan(namePos);
    expect(rolePos).toBeGreaterThan(displayPos);
    expect(expertisePos).toBeGreaterThan(rolePos);
    expect(useCasePos).toBeGreaterThan(expertisePos);
  });

  // Case 3 — empty-profile fall-through (Goals C14 / Invariant I4).
  // `name === DEFAULT_AGENT_NAME` and `userProfile: {}` produce zero
  // projection fragments; `balanced` preset adds zero personality
  // fragments — composed identity equals strengthened baseline.
  it('case 3: empty projection (default name + empty profile) returns base identity', () => {
    const baseline = resolveAgentProfile('Cortex::Principal');
    const withEmpty = resolveAgentProfile(
      'Cortex::Principal',
      undefined,
      { preset: 'balanced' },
      EMPTY_PROJECTION,
    );
    expect(withEmpty.identity).toBe(baseline.identity);
  });

  // Case 4 — non-default name produces an agent-name fragment (Goals C1).
  it('case 4: non-default name produces an agent-name fragment', () => {
    const profile = resolveAgentProfile(
      'Cortex::Principal',
      undefined,
      { preset: 'balanced' },
      { name: 'Atlas', userProfile: {} },
    );
    expect(profile.identity).toContain('Your name is "Atlas"');
  });

  // Case 5 — non-Principal non-leak (Goals C16 / Invariant C). System,
  // Orchestrator, Worker classes ignore the projection — composed identity
  // is byte-identical to the no-projection result.
  it.each(['Cortex::System', 'Orchestrator', 'Worker'] as const)(
    'case 5: %s ignores fully-populated projection (dimension isolation)',
    (agentClass) => {
      const baseline = resolveAgentProfile(agentClass, undefined, { preset: 'balanced' });
      const withProjection = resolveAgentProfile(
        agentClass,
        undefined,
        { preset: 'balanced' },
        FULL_PROJECTION,
      );
      expect(withProjection.identity).toBe(baseline.identity);
    },
  );

  // Case 8 — 16-case expertise × personality matrix (Goals risk row 6).
  // 4 presets × 4 expertise (3 enum + undefined) — every combination
  // produces a non-empty identity with no overlap or override.
  describe('case 8: expertise × personality matrix (4 × 4 = 16 cases)', () => {
    const presets: PersonalityConfig['preset'][] = ['balanced', 'professional', 'efficient', 'thorough'];
    const expertiseValues: Array<UserProfile['expertise'] | undefined> = [
      undefined,
      'beginner',
      'intermediate',
      'advanced',
    ];
    for (const preset of presets) {
      for (const expertise of expertiseValues) {
        it(`preset=${preset} expertise=${expertise ?? 'none'}: well-formed identity`, () => {
          const profile = resolveAgentProfile(
            'Cortex::Principal',
            undefined,
            { preset },
            { name: 'Atlas', userProfile: { displayName: 'A', expertise } },
          );
          expect(profile.identity.length).toBeGreaterThan(0);
          expect(profile.identity).toContain('Atlas');
          expect(profile.identity).toContain('"A"');
          // Expertise register directive present iff expertise was set.
          if (expertise === 'beginner') expect(profile.identity).toContain('clear, accessible');
          else if (expertise === 'intermediate') expect(profile.identity).toContain('working-practitioner');
          else if (expertise === 'advanced') expect(profile.identity).toContain('expert register');
        });
      }
    }
  });

  // Case 11 — strengthened-baseline (Goals C18). The pre-SP-1.9 byte-equal
  // assertion now reflects the new strengthened identity (Fix #2 anchor).
  it('case 11: strengthened baseline includes Fix #2 anchor phrase', () => {
    const baseline = resolveAgentProfile('Cortex::Principal');
    expect(baseline.identity).toContain('do not name the underlying model');
  });
});

describe('WR-127 dimension isolation under cortex-runtime migration (C25)', () => {
  for (const agentClass of MIGRATED_AGENT_CLASSES) {
    describe(`${agentClass}`, () => {
      const baseline = resolveAgentProfile(agentClass);

      for (const config of CONFIGS_FOR_DIMENSION_ISOLATION) {
        const label = config.overrides
          ? `${config.preset} + overrides`
          : config.preset;

        it(`${label}: contextBudget unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.contextBudget).toEqual(baseline.contextBudget);
        });

        it(`${label}: compactionStrategy unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.compactionStrategy).toEqual(baseline.compactionStrategy);
        });

        it(`${label}: loopShape unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.loopShape).toBe(baseline.loopShape);
        });

        it(`${label}: toolConcurrency unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.toolConcurrency).toEqual(baseline.toolConcurrency);
        });

        it(`${label}: escalationRules unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.escalationRules).toEqual(baseline.escalationRules);
        });

        it(`${label}: guardrails unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.guardrails).toEqual(baseline.guardrails);
        });

        it(`${label}: outputContract enum value unchanged from baseline`, () => {
          const actual = resolveAgentProfile(agentClass, undefined, config);
          expect(actual.outputContract).toBe(baseline.outputContract);
        });
      }
    });
  }
});
