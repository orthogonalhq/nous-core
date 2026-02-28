/**
 * Phase 6.1 — Cross-project retrieval schema contract tests.
 */
import { describe, it, expect } from 'vitest';
import {
  CrossProjectSelectionPolicySchema,
  SelectionAuditSchema,
  DEFAULT_CROSS_PROJECT_SELECTION_POLICY,
} from '../../types/cross-project-retrieval.js';
import { ProjectIdSchema } from '../../types/ids.js';

describe('CrossProjectSelectionPolicySchema', () => {
  it('accepts valid policy with tokenBudget, resultCap, policyDenialSuppression', () => {
    const valid = {
      tokenBudget: 500,
      resultCap: 20,
      policyDenialSuppression: true as const,
    };
    const parsed = CrossProjectSelectionPolicySchema.parse(valid);
    expect(parsed.tokenBudget).toBe(500);
    expect(parsed.resultCap).toBe(20);
    expect(parsed.policyDenialSuppression).toBe(true);
  });

  it('accepts DEFAULT_CROSS_PROJECT_SELECTION_POLICY', () => {
    const parsed = CrossProjectSelectionPolicySchema.parse(
      DEFAULT_CROSS_PROJECT_SELECTION_POLICY
    );
    expect(parsed).toEqual(DEFAULT_CROSS_PROJECT_SELECTION_POLICY);
  });

  it('rejects policyDenialSuppression false', () => {
    expect(() =>
      CrossProjectSelectionPolicySchema.parse({
        tokenBudget: 500,
        resultCap: 20,
        policyDenialSuppression: false,
      })
    ).toThrow();
  });

  it('rejects tokenBudget less than 1', () => {
    expect(() =>
      CrossProjectSelectionPolicySchema.parse({
        tokenBudget: 0,
        resultCap: 20,
        policyDenialSuppression: true,
      })
    ).toThrow();
  });

  it('rejects resultCap less than 1', () => {
    expect(() =>
      CrossProjectSelectionPolicySchema.parse({
        tokenBudget: 500,
        resultCap: 0,
        policyDenialSuppression: true,
      })
    ).toThrow();
  });
});

describe('SelectionAuditSchema', () => {
  const PROJECT_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');

  it('accepts valid audit with projectIdsQueried, candidateCount, resultCount', () => {
    const valid = {
      projectIdsQueried: [PROJECT_ID],
      candidateCount: 10,
      resultCount: 5,
    };
    const parsed = SelectionAuditSchema.parse(valid);
    expect(parsed.projectIdsQueried).toHaveLength(1);
    expect(parsed.candidateCount).toBe(10);
    expect(parsed.resultCount).toBe(5);
    expect(parsed.truncationReason).toBeUndefined();
  });

  it('accepts truncationReason token_budget', () => {
    const valid = {
      projectIdsQueried: [PROJECT_ID],
      candidateCount: 20,
      resultCount: 5,
      truncationReason: 'token_budget' as const,
    };
    const parsed = SelectionAuditSchema.parse(valid);
    expect(parsed.truncationReason).toBe('token_budget');
  });

  it('accepts truncationReason result_cap', () => {
    const valid = {
      projectIdsQueried: [PROJECT_ID],
      candidateCount: 20,
      resultCount: 20,
      truncationReason: 'result_cap' as const,
    };
    const parsed = SelectionAuditSchema.parse(valid);
    expect(parsed.truncationReason).toBe('result_cap');
  });

  it('accepts optional traceId', () => {
    const traceId = '660e8400-e29b-41d4-a716-446655440001' as any;
    const valid = {
      traceId,
      projectIdsQueried: [PROJECT_ID],
      candidateCount: 10,
      resultCount: 5,
    };
    const parsed = SelectionAuditSchema.parse(valid);
    expect(parsed.traceId).toBe(traceId);
  });

  it('rejects negative candidateCount', () => {
    expect(() =>
      SelectionAuditSchema.parse({
        projectIdsQueried: [PROJECT_ID],
        candidateCount: -1,
        resultCount: 0,
      })
    ).toThrow();
  });
});
