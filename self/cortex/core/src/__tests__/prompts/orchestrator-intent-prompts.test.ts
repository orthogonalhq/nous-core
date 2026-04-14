import { describe, expect, it } from 'vitest';
import type { DispatchIntent } from '@nous/shared';
import { getOrchestratorPrompt } from '../../prompts/orchestrator-intent-prompts.js';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../../prompts/orchestrator-system-prompt.js';

describe('getOrchestratorPrompt', () => {
  it('returns ORCHESTRATOR_SYSTEM_PROMPT when intent is undefined', () => {
    const result = getOrchestratorPrompt(undefined);
    expect(result).toBe(ORCHESTRATOR_SYSTEM_PROMPT);
  });

  it('returns workflow prompt for workflow intent', () => {
    const intent: DispatchIntent = {
      type: 'workflow',
      workflowDefinitionId: 'test-wf-001',
    };
    const result = getOrchestratorPrompt(intent);

    expect(result).toContain('test-wf-001');
    expect(result).toContain('workflow');
    expect(result).not.toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns task prompt for task intent', () => {
    const intent: DispatchIntent = {
      type: 'task',
    };
    const result = getOrchestratorPrompt(intent);

    expect(result).toContain('task');
    expect(result).not.toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns skill prompt for skill intent', () => {
    const intent: DispatchIntent = {
      type: 'skill',
      skillRef: 'engineer-workflow',
    };
    const result = getOrchestratorPrompt(intent);

    expect(result).toContain('engineer-workflow');
    expect(result).toContain('skill');
    expect(result).not.toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns autonomous prompt for autonomous intent', () => {
    const intent: DispatchIntent = {
      type: 'autonomous',
      objective: 'Investigate production latency spike',
    };
    const result = getOrchestratorPrompt(intent);

    expect(result).toContain('Investigate production latency spike');
    expect(result).toContain('autonomous');
    expect(result).not.toBe(ORCHESTRATOR_SYSTEM_PROMPT);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns different prompts for different intent types', () => {
    const workflowResult = getOrchestratorPrompt({ type: 'workflow', workflowDefinitionId: 'wf-1' });
    const taskResult = getOrchestratorPrompt({ type: 'task' });
    const skillResult = getOrchestratorPrompt({ type: 'skill', skillRef: 'test-skill' });
    const autonomousResult = getOrchestratorPrompt({ type: 'autonomous', objective: 'test' });

    const prompts = [workflowResult, taskResult, skillResult, autonomousResult];
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBe(4);
  });

  it('workflow prompt mentions harness and judgment posture', () => {
    const result = getOrchestratorPrompt({
      type: 'workflow',
      workflowDefinitionId: 'wf-1',
    });

    expect(result).toContain('harness');
    expect(result).toContain('Error triage');
    expect(result).toContain('Escalation decisions');
  });

  it('skill prompt mentions skill boundary', () => {
    const result = getOrchestratorPrompt({
      type: 'skill',
      skillRef: 'deploy-pipeline',
    });

    expect(result).toContain('deploy-pipeline');
    expect(result).toContain('skill boundary');
  });

  it('autonomous prompt mentions escalation to Cortex', () => {
    const result = getOrchestratorPrompt({
      type: 'autonomous',
      objective: 'Monitor system health',
    });

    expect(result).toContain('Escalate to Cortex');
  });
});
