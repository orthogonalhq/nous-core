import { describe, expect, it } from 'vitest';
import { composeFromProfile } from '../../gateway-runtime/prompt-composer.js';
import type { AgentProfile } from '../../gateway-runtime/prompt-strategy.js';
import type { AdapterCapabilities } from '../../agent-gateway/adapters/types.js';
import type { ToolDefinition } from '@nous/shared';

const TEXT_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: false,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

const NATIVE_TOOL_CAPABILITIES: AdapterCapabilities = {
  nativeToolUse: true,
  cacheControl: false,
  extendedThinking: false,
  streaming: false,
};

const BASE_PROFILE: AgentProfile = {
  identity: 'You are a worker agent.',
  taskFrame: 'Execute the assigned task.',
  toolPolicy: 'text-listed',
  guardrails: ['Do not deviate from scope.', 'Return structured output.'],
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'lookup_status',
    version: '1.0.0',
    description: 'Lookup task status.',
    inputSchema: {},
    outputSchema: {},
    capabilities: ['read'],
    permissionScope: 'project',
  },
];

describe('composeFromProfile', () => {
  it('composes identity + taskFrame + guardrails into system prompt', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Do the thing.',
    });
    expect(result.systemPrompt).toContain('You are a worker agent.');
    expect(result.systemPrompt).toContain('Execute the assigned task.');
    expect(result.systemPrompt).toContain('Do not deviate from scope.');
    expect(result.systemPrompt).toContain('Return structured output.');
  });

  it('includes baseSystemPrompt when provided', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Do the thing.',
      baseSystemPrompt: 'Custom base prompt.',
    });
    expect(result.systemPrompt).toContain('Custom base prompt.');
  });

  it('includes task instructions', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Complete phase 1.2.',
    });
    expect(result.systemPrompt).toContain('Task Instructions:\nComplete phase 1.2.');
  });

  it('includes execution context fields when present', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Task.',
      execution: {
        projectId: 'proj-1' as any,
        executionId: 'exec-1',
        workmodeId: 'system:implementation',
      },
    });
    expect(result.systemPrompt).toContain('project_id: proj-1');
    expect(result.systemPrompt).toContain('execution_id: exec-1');
    expect(result.systemPrompt).toContain('workmode_id: system:implementation');
  });

  it('with nativeToolUse true — returns tools in toolDefinitions, not in prompt text', () => {
    const result = composeFromProfile(BASE_PROFILE, NATIVE_TOOL_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Task.',
      tools: TOOLS,
    });
    expect(result.toolDefinitions).toEqual(TOOLS);
    expect(result.systemPrompt).not.toContain('Available Tools');
  });

  it('with nativeToolUse false and text-listed policy — lists tools in prompt text', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Task.',
      tools: TOOLS,
    });
    expect(result.toolDefinitions).toBeUndefined();
    expect(result.systemPrompt).toContain('Available Tools:');
    expect(result.systemPrompt).toContain('- lookup_status');
  });

  it('with toolPolicy omit — no tools in prompt, toolDefinitions undefined', () => {
    const omitProfile: AgentProfile = { ...BASE_PROFILE, toolPolicy: 'omit' };
    const result = composeFromProfile(omitProfile, TEXT_CAPABILITIES, {
      agentClass: 'Cortex::Principal',
      taskInstructions: 'Task.',
      tools: TOOLS,
    });
    expect(result.toolDefinitions).toBeUndefined();
    expect(result.systemPrompt).not.toContain('Available Tools');
  });

  it('empty tools array — no tools section in either mode', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Task.',
      tools: [],
    });
    expect(result.toolDefinitions).toBeUndefined();
    expect(result.systemPrompt).not.toContain('Available Tools');
  });

  it('formats guardrails section correctly', () => {
    const result = composeFromProfile(BASE_PROFILE, TEXT_CAPABILITIES, {
      agentClass: 'Worker',
      taskInstructions: 'Task.',
    });
    expect(result.systemPrompt).toContain('Rules:\n- Do not deviate from scope.\n- Return structured output.');
  });
});
