import { describe, it, expect } from 'vitest';
import { composeSystemPrompt } from '../system-prompt-composer.js';

describe('composeSystemPrompt — workflow authoring hint', () => {
  const baseInput = {
    taskInstructions: 'Test task',
  };

  // ── Tier 2: Behavior Tests ──────────────────────────────────────────────

  it('includes workflow_authoring_reference hint for Cortex::System', () => {
    const result = composeSystemPrompt({
      ...baseInput,
      agentClass: 'Cortex::System',
    });
    expect(result).toContain('workflow_authoring_reference');
    expect(result).toContain('Before authoring workflow YAML');
  });

  it('includes workflow_authoring_reference hint for Orchestrator', () => {
    const result = composeSystemPrompt({
      ...baseInput,
      agentClass: 'Orchestrator',
    });
    expect(result).toContain('workflow_authoring_reference');
    expect(result).toContain('Before authoring workflow YAML');
  });

  it('does NOT include workflow_authoring_reference hint for Worker', () => {
    const result = composeSystemPrompt({
      ...baseInput,
      agentClass: 'Worker',
    });
    expect(result).not.toContain('workflow_authoring_reference');
  });

  it('does NOT include workflow_authoring_reference hint for Cortex::Principal', () => {
    const result = composeSystemPrompt({
      ...baseInput,
      agentClass: 'Cortex::Principal',
    });
    expect(result).not.toContain('workflow_authoring_reference');
  });

  // ── Tier 1: Contract Tests ──────────────────────────────────────────────

  it('always includes the agent identity prompt', () => {
    for (const agentClass of ['Cortex::System', 'Orchestrator', 'Worker', 'Cortex::Principal'] as const) {
      const result = composeSystemPrompt({
        ...baseInput,
        agentClass,
      });
      expect(result).toContain(`You are ${agentClass === 'Orchestrator' ? 'an Orchestrator' : agentClass === 'Worker' ? 'a Worker' : agentClass}`);
    }
  });

  it('always includes task instructions', () => {
    const result = composeSystemPrompt({
      ...baseInput,
      agentClass: 'Cortex::System',
    });
    expect(result).toContain('Task Instructions:\nTest task');
  });
});
