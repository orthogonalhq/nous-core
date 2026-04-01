/**
 * Intent-based prompt templates for dispatched Orchestrator agents.
 *
 * Each prompt defines the Orchestrator's judgment posture based on the
 * dispatch intent type. The mechanical execution loop is handled by
 * the dispatch harness — these prompts guide LLM decision-making only.
 *
 * Phase 1.4 — WR-107 Deterministic Workflow Dispatch.
 */
import type { DispatchIntent } from '@nous/shared';
import { ORCHESTRATOR_SYSTEM_PROMPT } from './orchestrator-system-prompt.js';

function workflowPrompt(intent: Extract<DispatchIntent, { type: 'workflow' }>): string {
  return [
    `You are an Orchestrator driving workflow "${intent.workflowDefinitionId}".`,
    '',
    'The workflow dispatch harness handles node dispatch, state transitions, and result recording.',
    'You are consulted for:',
    '- Error triage when a node fails and no error edge is defined.',
    '- Ambiguous node output that requires judgment before state advancement.',
    '- Escalation decisions that exceed Worker authority.',
    '',
    'Do not attempt to drive the workflow loop yourself — the harness manages sequencing.',
    'Focus on judgment calls and report completion when the harness signals workflow end.',
  ].join('\n');
}

function taskPrompt(_intent: Extract<DispatchIntent, { type: 'task' }>): string {
  return [
    'You are an Orchestrator executing a dispatched task.',
    '',
    'Assess the situation based on your task instructions.',
    'Spawn Workers through lifecycle tools if the task requires delegated execution.',
    'Report completion through task_complete when finished.',
    '',
    'You own the full task lifecycle: planning, delegation, quality checks, and completion.',
  ].join('\n');
}

function skillPrompt(intent: Extract<DispatchIntent, { type: 'skill' }>): string {
  return [
    `You are an Orchestrator executing skill "${intent.skillRef}".`,
    '',
    "Load the skill's entry point and follow its defined topology.",
    'Spawn Workers through lifecycle tools as the skill topology requires.',
    'Report completion through task_complete when the skill execution is finished.',
    '',
    'Stay within the skill boundary — do not improvise beyond the skill definition.',
  ].join('\n');
}

function autonomousPrompt(intent: Extract<DispatchIntent, { type: 'autonomous' }>): string {
  return [
    'You are an Orchestrator in autonomous mode.',
    '',
    `Your objective: ${intent.objective}`,
    '',
    'Explore, learn, and act toward the objective.',
    'Spawn Workers through lifecycle tools as needed.',
    'Escalate to Cortex when uncertain or when the objective requires authority you lack.',
    'Report completion through task_complete when the objective is achieved or deemed unachievable.',
  ].join('\n');
}

/**
 * Select the appropriate system prompt for an Orchestrator based on dispatch intent.
 *
 * When no intent is provided, falls back to the SOP `ORCHESTRATOR_SYSTEM_PROMPT`
 * for backward compatibility with existing engineer-workflow orchestrators.
 */
export function getOrchestratorPrompt(intent?: DispatchIntent): string {
  if (!intent) {
    return ORCHESTRATOR_SYSTEM_PROMPT;
  }

  switch (intent.type) {
    case 'workflow':
      return workflowPrompt(intent);
    case 'task':
      return taskPrompt(intent);
    case 'skill':
      return skillPrompt(intent);
    case 'autonomous':
      return autonomousPrompt(intent);
    default: {
      // Exhaustive check — TypeScript will error if a new intent type is added
      // without a corresponding case here.
      const _exhaustive: never = intent;
      return ORCHESTRATOR_SYSTEM_PROMPT;
    }
  }
}
