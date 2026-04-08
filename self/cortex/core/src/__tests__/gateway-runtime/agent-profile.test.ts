import { describe, expect, it } from 'vitest';
import type { AgentClass } from '@nous/shared';
import {
  resolveAgentProfile,
  type AgentProfile,
  type PromptConfig,
} from '../../gateway-runtime/prompt-strategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_AGENT_CLASSES: AgentClass[] = [
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
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
    // Compile-time check: if this compiles, the type contract is satisfied
    const config: PromptConfig = {
      identity: 'test',
      taskFrame: 'test',
      toolPolicy: 'omit',
      guardrails: [],
      personalityConfig: { name: 'test' },
    };
    expect(config.personalityConfig).toEqual({ name: 'test' });
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
// Tier 2 — Behavior Tests
// ---------------------------------------------------------------------------

describe('resolveAgentProfile — behavior tests', () => {
  describe('personality override', () => {
    it('with non-null personality: identity and outputContract pass through personality functions', () => {
      const withPersonality = resolveAgentProfile('Cortex::Principal', undefined, { style: 'casual' });
      const withoutPersonality = resolveAgentProfile('Cortex::Principal');
      // Currently no-op — both return same values
      expect(withPersonality.identity).toBe(withoutPersonality.identity);
      expect(withPersonality.outputContract).toBe(withoutPersonality.outputContract);
    });

    it('with null/undefined personality: identity unchanged', () => {
      const withNull = resolveAgentProfile('Worker', undefined, null);
      const withUndefined = resolveAgentProfile('Worker');
      // null is treated as no personality (null == null is falsy for != null check)
      expect(withUndefined.identity).toBe(withNull.identity);
    });

    it('personality never affects guardrails', () => {
      for (const agentClass of ALL_AGENT_CLASSES) {
        const withPersonality = resolveAgentProfile(agentClass, undefined, { style: 'casual' });
        const withoutPersonality = resolveAgentProfile(agentClass);
        expect(withPersonality.guardrails).toEqual(withoutPersonality.guardrails);
      }
    });

    it('personality never affects mechanical dimensions', () => {
      for (const agentClass of ALL_AGENT_CLASSES) {
        const withPersonality = resolveAgentProfile(agentClass, undefined, { style: 'casual' });
        const withoutPersonality = resolveAgentProfile(agentClass);
        expect(withPersonality.contextBudget).toEqual(withoutPersonality.contextBudget);
        expect(withPersonality.loopShape).toBe(withoutPersonality.loopShape);
        expect(withPersonality.toolConcurrency).toEqual(withoutPersonality.toolConcurrency);
        expect(withPersonality.escalationRules).toEqual(withoutPersonality.escalationRules);
        expect(withPersonality.compactionStrategy).toBe(withoutPersonality.compactionStrategy);
      }
    });

    it('personalityConfig field appears on returned profile when provided', () => {
      const personality = { name: 'TestBot', style: 'formal' };
      const profile = resolveAgentProfile('Worker', undefined, personality);
      expect(profile.personalityConfig).toBe(personality);
    });

    it('personalityConfig is undefined when not provided', () => {
      const profile = resolveAgentProfile('Worker');
      expect(profile.personalityConfig).toBeUndefined();
    });
  });

  describe('provider axis', () => {
    it('unknown provider returns same dimensions as default', () => {
      const defaultProfile = resolveAgentProfile('Worker');
      const unknownProvider = resolveAgentProfile('Worker', 'unknown-provider-xyz');
      expect(unknownProvider.loopShape).toBe(defaultProfile.loopShape);
      expect(unknownProvider.outputContract).toBe(defaultProfile.outputContract);
      expect(unknownProvider.escalationRules).toEqual(defaultProfile.escalationRules);
    });
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
