/**
 * Prompt routing parity (C24 — Decision 4 fail-close).
 *
 * Mirrors the test-independence pattern used by SP 1.2's
 * `integration-with-apply-personality.test.ts` (lines 30-45): capture the
 * expected output via a path that does NOT route through the surface under
 * test (`resolveAgentProfile` + personality pipeline), compare to actual
 * output produced by the migrated path. Sharing `resolvePromptConfig` between
 * sides is intentional — that function is unchanged by SP 1.3 (Decision 4
 * § Untouched Surfaces, Goals C23).
 *
 * Binding scope (per SDS § 6.4): `'Cortex::Principal'` and `'Cortex::System'`
 * are the C24 fail-close assertions; `'Orchestrator'` and `'Worker'` are
 * forward-compatibility soft signals (their migration is out of scope per
 * Decision 4 § Production Wiring). The systemTools-populated assertion is
 * the SDS-review Should-Fix #3 future-proof.
 */
import { describe, expect, it } from 'vitest';
import type { AgentClass, ToolDefinition } from '@nous/shared';
import {
  composeSystemPromptFromConfig,
  resolveAgentProfile,
  resolvePromptConfig,
} from '../../gateway-runtime/prompt-strategy.js';

const ALL_AGENT_CLASSES: AgentClass[] = [
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
];

// SP 1.3 SDS-review Should-Fix #3: a synthetic systemTools fixture exercises
// the production System call site shape with `tools` populated (not
// undefined). The base `{ preset: 'balanced' }` byte-identity assertion still
// holds (all fragments null), and this future-proofs against any signature
// change that later introduces a tools-personality interaction.
const SYSTEM_TOOLS_FIXTURE: ToolDefinition[] = [
  {
    name: 'echo',
    version: '1.0.0',
    description: 'Echo input back',
    inputSchema: {},
    outputSchema: {},
    capabilities: [],
    permissionScope: 'public',
  },
];

describe("Prompt routing parity (C24 — Decision 4 fail-close)", () => {
  for (const agentClass of ALL_AGENT_CLASSES) {
    it(`${agentClass}: byte-identity at { preset: 'balanced' } (no tools)`, () => {
      const expected = composeSystemPromptFromConfig(
        resolvePromptConfig(agentClass),
      );
      const actual = composeSystemPromptFromConfig(
        resolveAgentProfile(agentClass, undefined, { preset: 'balanced' }),
      );
      expect(actual).toBe(expected);
    });
  }

  it("Cortex::System: byte-identity at { preset: 'balanced' } with populated systemTools (SDS-review Should-Fix #3)", () => {
    const expected = composeSystemPromptFromConfig(
      resolvePromptConfig('Cortex::System'),
      SYSTEM_TOOLS_FIXTURE,
    );
    const actual = composeSystemPromptFromConfig(
      resolveAgentProfile('Cortex::System', undefined, { preset: 'balanced' }),
      SYSTEM_TOOLS_FIXTURE,
    );
    expect(actual).toBe(expected);
  });
});
