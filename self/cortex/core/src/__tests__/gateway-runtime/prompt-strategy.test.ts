import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@nous/shared';
import {
  resolvePromptConfig,
  composeSystemPromptFromConfig,
  type PromptConfig,
  type ToolPolicy,
} from '../../gateway-runtime/prompt-strategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubTool(name: string): ToolDefinition {
  return {
    name,
    version: '1.0.0',
    description: `Stub tool: ${name}`,
    inputSchema: {},
    outputSchema: {},
    capabilities: [],
    permissionScope: 'test',
  };
}

const ALL_AGENT_CLASSES = [
  'Cortex::Principal',
  'Cortex::System',
  'Orchestrator',
  'Worker',
] as const;

// ---------------------------------------------------------------------------
// Tier 1 — Contract Tests
// ---------------------------------------------------------------------------

describe('resolvePromptConfig', () => {
  it('returns toolPolicy "omit" for Cortex::Principal', () => {
    const config = resolvePromptConfig('Cortex::Principal');
    expect(config.toolPolicy).toBe('native');
  });

  it('returns identity containing "AI assistant" for Cortex::Principal', () => {
    const config = resolvePromptConfig('Cortex::Principal');
    expect(config.identity).toContain('AI assistant');
  });

  it('returns toolPolicy "text-listed" for Cortex::System', () => {
    const config = resolvePromptConfig('Cortex::System');
    expect(config.toolPolicy).toBe('text-listed');
  });

  it('returns identity containing "coordinator" for Cortex::System', () => {
    const config = resolvePromptConfig('Cortex::System');
    expect(config.identity).toContain('coordinator');
  });

  it('returns toolPolicy "text-listed" for Orchestrator', () => {
    const config = resolvePromptConfig('Orchestrator');
    expect(config.toolPolicy).toBe('text-listed');
  });

  it('returns identity containing "planner" for Orchestrator', () => {
    const config = resolvePromptConfig('Orchestrator');
    expect(config.identity).toContain('planner');
  });

  it('returns toolPolicy "text-listed" for Worker', () => {
    const config = resolvePromptConfig('Worker');
    expect(config.toolPolicy).toBe('text-listed');
  });

  it('returns identity containing "execution" for Worker', () => {
    const config = resolvePromptConfig('Worker');
    expect(config.identity).toContain('execution');
  });

  it('returns non-empty identity, taskFrame, and guardrails for all 4 agent classes', () => {
    for (const agentClass of ALL_AGENT_CLASSES) {
      const config = resolvePromptConfig(agentClass);
      expect(config.identity.length).toBeGreaterThan(0);
      expect(config.taskFrame.length).toBeGreaterThan(0);
      expect(config.guardrails.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — Behavior Tests
// ---------------------------------------------------------------------------

describe('resolvePromptConfig — provider axis', () => {
  it('returns default config when providerId is undefined', () => {
    const withUndefined = resolvePromptConfig('Cortex::Principal');
    const withExplicit = resolvePromptConfig('Cortex::Principal', undefined);
    expect(withUndefined).toEqual(withExplicit);
  });

  it('returns default config when providerId is an unknown string', () => {
    const defaultConfig = resolvePromptConfig('Worker');
    const unknownConfig = resolvePromptConfig('Worker', 'unknown-provider');
    expect(unknownConfig).toEqual(defaultConfig);
  });

  it('returns default config when providerId is an empty string', () => {
    const defaultConfig = resolvePromptConfig('Cortex::System');
    const emptyConfig = resolvePromptConfig('Cortex::System', '');
    expect(emptyConfig).toEqual(defaultConfig);
  });
});

describe('composeSystemPromptFromConfig', () => {
  const tools = [stubTool('read_file'), stubTool('write_file')];

  it('with toolPolicy "omit" and non-empty tools: prompt contains no tool names', () => {
    const config = resolvePromptConfig('Cortex::Principal');
    expect(config.toolPolicy).toBe('omit');

    const prompt = composeSystemPromptFromConfig(config, tools);
    expect(prompt).not.toContain('read_file');
    expect(prompt).not.toContain('write_file');
    expect(prompt).not.toContain('Available Tools');
  });

  it('with toolPolicy "native" and non-empty tools: prompt contains no tool names', () => {
    const nativeConfig: PromptConfig = {
      identity: 'Test identity',
      taskFrame: 'Test task frame',
      toolPolicy: 'native',
      guardrails: ['Test guardrail'],
    };
    const prompt = composeSystemPromptFromConfig(nativeConfig, tools);
    expect(prompt).not.toContain('read_file');
    expect(prompt).not.toContain('write_file');
    expect(prompt).not.toContain('Available Tools');
  });

  it('with toolPolicy "text-listed" and non-empty tools: prompt includes tool names', () => {
    const config = resolvePromptConfig('Worker');
    expect(config.toolPolicy).toBe('text-listed');

    const prompt = composeSystemPromptFromConfig(config, tools);
    expect(prompt).toContain('Available Tools');
    expect(prompt).toContain('- read_file');
    expect(prompt).toContain('- write_file');
  });

  it('with toolPolicy "text-listed" and empty tools array: prompt has no tool section', () => {
    const config = resolvePromptConfig('Worker');
    const prompt = composeSystemPromptFromConfig(config, []);
    expect(prompt).not.toContain('Available Tools');
  });

  it('with toolPolicy "text-listed" and undefined tools: prompt has no tool section', () => {
    const config = resolvePromptConfig('Orchestrator');
    const prompt = composeSystemPromptFromConfig(config);
    expect(prompt).not.toContain('Available Tools');
  });

  it('guardrails from config are present in composed prompt', () => {
    const config = resolvePromptConfig('Cortex::Principal');
    const prompt = composeSystemPromptFromConfig(config);

    for (const guardrail of config.guardrails) {
      expect(prompt).toContain(guardrail);
    }
    expect(prompt).toContain('Rules:');
  });

  it('identity and taskFrame are present in composed prompt', () => {
    const config = resolvePromptConfig('Cortex::System');
    const prompt = composeSystemPromptFromConfig(config);
    expect(prompt).toContain(config.identity);
    expect(prompt).toContain(config.taskFrame);
  });
});

// ---------------------------------------------------------------------------
// Tier 3 — Edge Case Tests
// ---------------------------------------------------------------------------

describe('composeSystemPromptFromConfig — edge cases', () => {
  it('handles config with empty guardrails array', () => {
    const config: PromptConfig = {
      identity: 'Minimal identity',
      taskFrame: 'Minimal task frame',
      toolPolicy: 'omit',
      guardrails: [],
    };
    const prompt = composeSystemPromptFromConfig(config);
    expect(prompt).not.toContain('Rules:');
    expect(prompt).toContain('Minimal identity');
    expect(prompt).toContain('Minimal task frame');
  });

  it('Principal identity contains key authority phrases', () => {
    const config = resolvePromptConfig('Cortex::Principal');
    expect(config.identity).toContain('AI assistant');
    expect(config.identity).toContain('conversational');
  });

  it('System identity contains key authority phrases', () => {
    const config = resolvePromptConfig('Cortex::System');
    expect(config.identity).toContain('coordinator');
    expect(config.identity).toContain('dispatch');
  });

  it('Orchestrator identity contains key authority phrases', () => {
    const config = resolvePromptConfig('Orchestrator');
    expect(config.identity).toContain('planner');
    expect(config.identity).toContain('dispatch');
  });

  it('Worker identity contains key authority phrases', () => {
    const config = resolvePromptConfig('Worker');
    expect(config.identity).toContain('execution');
    expect(config.identity).toContain('task_complete');
  });
});
