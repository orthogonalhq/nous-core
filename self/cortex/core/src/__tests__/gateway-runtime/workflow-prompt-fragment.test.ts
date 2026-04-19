import { describe, expect, it } from 'vitest';
import { WORKFLOW_PROMPT_FRAGMENT } from '../../gateway-runtime/workflow-prompt-fragment.js';

describe('WORKFLOW_PROMPT_FRAGMENT — content contract', () => {
  // ── Tier 1: Contract Tests ─────────────────────────────────────────────

  it('contains read-only tool names', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_list');
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_inspect');
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_status');
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_validate');
  });

  it('contains delegation tool reference (submit_task_to_system)', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('submit_task_to_system');
  });

  it('contains "when to delegate" guidance', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('When to delegate');
  });

  it('contains "when NOT to delegate" guidance', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('When NOT to delegate');
  });

  it('contains delegation task format examples (workflow_start, workflow_create)', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_start');
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('workflow_create');
  });

  it('contains project-scoped thread note', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('project-scoped thread');
  });

  it('is a non-empty string', () => {
    expect(typeof WORKFLOW_PROMPT_FRAGMENT).toBe('string');
    expect(WORKFLOW_PROMPT_FRAGMENT.length).toBeGreaterThan(100);
  });

  // ── SP 1.15 RC-4 — tool-result-recognition anchor ──
  it('SP 1.15 RC-4 — contains the **Tool results:** anchor', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('**Tool results:**');
  });

  it('SP 1.15 RC-4 — contains the load-bearing semantic ("Treat this as the answer to your call")', () => {
    expect(WORKFLOW_PROMPT_FRAGMENT).toContain('Treat this as the answer to your call');
  });
});
