/**
 * Conformance matrix: identical PolicyAccessContext yields identical PolicyEvaluationResult.
 * Validates that the policy engine is the single source; surfaces produce equivalent allow/deny.
 */
import { describe, it, expect } from 'vitest';
import { MemoryAccessPolicyEngine } from '../policy-engine.js';
import type { PolicyAccessContext } from '@nous/shared';
import { DEFAULT_MEMORY_ACCESS_POLICY, ProjectIdSchema } from '@nous/shared';

const FROM_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const TARGET_ID = ProjectIdSchema.parse('660e8400-e29b-41d4-a716-446655440001');

const engine = new MemoryAccessPolicyEngine();

function evaluate(ctx: PolicyAccessContext) {
  return engine.evaluate(ctx);
}

describe('Conformance matrix', () => {
  it('identical PolicyAccessContext produces identical PolicyEvaluationResult', () => {
    const ctx: PolicyAccessContext = {
      action: 'read',
      fromProjectId: FROM_ID,
      targetProjectId: TARGET_ID,
      includeGlobal: true,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    };

    const r1 = evaluate(ctx);
    const r2 = evaluate(ctx);

    expect(r1.allowed).toBe(r2.allowed);
    expect(r1.reasonCode).toBe(r2.reasonCode);
    expect(r1.reason).toBe(r2.reason);
  });

  it('equivalent logical inputs across actions produce consistent allow/deny', () => {
    const readCtx: PolicyAccessContext = {
      action: 'read',
      fromProjectId: FROM_ID,
      targetProjectId: TARGET_ID,
      includeGlobal: false,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    };

    const writeCtx: PolicyAccessContext = {
      action: 'write',
      fromProjectId: FROM_ID,
      targetProjectId: TARGET_ID,
      includeGlobal: false,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    };

    const readResult = evaluate(readCtx);
    const writeResult = evaluate(writeCtx);

    expect(readResult.allowed).toBe(writeResult.allowed);
    expect(readResult.reasonCode).toBe(writeResult.reasonCode);
  });

  it('identical retrieve context with includeGlobal produces identical result', () => {
    const ctx: PolicyAccessContext = {
      action: 'retrieve',
      fromProjectId: FROM_ID,
      includeGlobal: true,
      projectPolicy: { ...DEFAULT_MEMORY_ACCESS_POLICY, inheritsGlobal: false },
      targetProjectIds: [],
      targetProjectPolicies: {},
    };

    const r1 = evaluate(ctx);
    const r2 = evaluate(ctx);

    expect(r1.allowed).toBe(r2.allowed);
    expect(r1.reasonCode).toBe(r2.reasonCode);
    expect(r1.reasonCode).toBe('POL-GLOBAL-DENIED');
  });

  it('identical retrieve context with inheritsGlobal true produces allow', () => {
    const ctx: PolicyAccessContext = {
      action: 'retrieve',
      fromProjectId: FROM_ID,
      includeGlobal: true,
      projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      targetProjectIds: [],
      targetProjectPolicies: {},
    };

    const r1 = evaluate(ctx);
    const r2 = evaluate(ctx);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r1.reasonCode).toBe(r2.reasonCode);
  });
});
