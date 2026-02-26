import { describe, expect, it } from 'vitest';
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  WORKFLOW_ROUTER_SYSTEM_PROMPT,
} from '../prompts/index.js';

describe('cortex system prompts', () => {
  it('includes router role lock and single-packet invariant', () => {
    expect(WORKFLOW_ROUTER_SYSTEM_PROMPT).toContain(
      'You are `Cortex:System::workflow-router`.',
    );
    expect(WORKFLOW_ROUTER_SYSTEM_PROMPT).toContain('Single-packet invariant');
    expect(WORKFLOW_ROUTER_SYSTEM_PROMPT).toContain(
      '`generated_implementation_prompt`',
    );
  });

  it('includes orchestrator role lock and lane graph', () => {
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain(
      'You are `Orchestrator::engineer-workflow`.',
    );
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('Primary lane graph:');
    expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain(
      'Failure behavior:',
    );
  });

  it('does not contain nested packet envelope markers', () => {
    expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toContain('\n---\nnous:');
    expect(WORKFLOW_ROUTER_SYSTEM_PROMPT).not.toContain('\n---\nnous:');
  });
});

