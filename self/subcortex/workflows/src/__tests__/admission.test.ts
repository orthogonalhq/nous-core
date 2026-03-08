import { describe, it, expect } from 'vitest';
import { evaluateWorkflowAdmission } from '../admission.js';

const baseRequest = () => ({
  projectId: '550e8400-e29b-41d4-a716-446655440301',
  workflowDefinitionId: '550e8400-e29b-41d4-a716-446655440302',
  workmodeId: 'system:implementation',
  sourceActor: 'orchestration_agent' as const,
  targetActor: 'worker_agent' as const,
  controlState: 'running' as const,
}) as any;

describe('evaluateWorkflowAdmission', () => {
  it('allows valid workflow admission', () => {
    const result = evaluateWorkflowAdmission(baseRequest());
    expect(result.allowed).toBe(true);
  });

  it('blocks hard_stopped projects', () => {
    const result = evaluateWorkflowAdmission({
      ...baseRequest(),
      controlState: 'hard_stopped',
    });
    expect(result).toMatchObject({
      allowed: false,
      reasonCode: 'POL-CONTROL-STATE-BLOCKED',
    });
  });

  it('blocks paused_review projects', () => {
    const result = evaluateWorkflowAdmission({
      ...baseRequest(),
      controlState: 'paused_review',
    });
    expect(result).toMatchObject({
      allowed: false,
      reasonCode: 'POL-PAUSED-BLOCKED',
    });
  });

  it('blocks worker-sourced admission', () => {
    const result = evaluateWorkflowAdmission({
      ...baseRequest(),
      sourceActor: 'worker_agent',
    });
    expect(result).toMatchObject({
      allowed: false,
      reasonCode: 'WMODE-010',
    });
  });

  it('blocks invalid target widening', () => {
    const result = evaluateWorkflowAdmission({
      ...baseRequest(),
      targetActor: 'orchestration_agent',
    });
    expect(result).toMatchObject({
      allowed: false,
      reasonCode: 'WMODE-003',
    });
  });
});
