/**
 * Phase 3.4: Export-hooks verification.
 *
 * Verifies that the documented Phase 4/5 intake exports exist and are importable.
 * Aligns with .worklog/phase-3/phase-3.4/export-hooks.mdx.
 */
import { describe, it, expect } from 'vitest';
import {
  MemoryAccessPolicyEngine,
  PolicyEnforcedRetrievalEngine,
  buildPolicyAccessContextForMemoryWrite,
  isCrossProjectMemoryWrite,
  type PolicyAccessContext,
  type PolicyEvaluationResult,
} from '@nous/memory-access';
import type {
  IMemoryAccessPolicyEngine,
  PolicyDecisionRecord,
} from '@nous/shared';
import {
  PolicyAccessContextSchema,
  PolicyEvaluationResultSchema,
  PolicyDecisionRecordSchema,
} from '@nous/shared';

describe('export-hooks verification', () => {
  describe('@nous/memory-access exports', () => {
    it('exports MemoryAccessPolicyEngine', () => {
      expect(MemoryAccessPolicyEngine).toBeDefined();
      expect(typeof MemoryAccessPolicyEngine).toBe('function');
    });

    it('exports PolicyEnforcedRetrievalEngine', () => {
      expect(PolicyEnforcedRetrievalEngine).toBeDefined();
      expect(typeof PolicyEnforcedRetrievalEngine).toBe('function');
    });

    it('exports buildPolicyAccessContextForMemoryWrite', () => {
      expect(buildPolicyAccessContextForMemoryWrite).toBeDefined();
      expect(typeof buildPolicyAccessContextForMemoryWrite).toBe('function');
    });

    it('exports isCrossProjectMemoryWrite', () => {
      expect(isCrossProjectMemoryWrite).toBeDefined();
      expect(typeof isCrossProjectMemoryWrite).toBe('function');
    });

    it('re-exports PolicyAccessContext and PolicyEvaluationResult', () => {
      // Type-level check; runtime we use the schema
      const ctx: PolicyAccessContext = {
        action: 'retrieve',
        fromProjectId: '00000000-0000-0000-0000-000000000001',
        includeGlobal: true,
        projectPolicy: {
          canReadFrom: 'all',
          canBeReadBy: 'all',
          inheritsGlobal: true,
        },
      };
      expect(PolicyAccessContextSchema.safeParse(ctx).success).toBe(true);

      const result: PolicyEvaluationResult = {
        allowed: true,
        reasonCode: 'POL-DEFAULT',
        reason: 'ok',
        decisionRecord: {
          id: '00000000-0000-0000-0000-000000000002',
          projectId: '00000000-0000-0000-0000-000000000001',
          action: 'retrieve',
          outcome: 'allowed',
          reasonCode: 'POL-DEFAULT',
          reason: 'ok',
          occurredAt: new Date().toISOString(),
        },
      };
      expect(PolicyEvaluationResultSchema.safeParse(result).success).toBe(true);
    });
  });

  describe('@nous/shared exports', () => {
    it('exports IMemoryAccessPolicyEngine (interface)', () => {
      // Interface is type-only; MemoryAccessPolicyEngine implements it
      const engine: IMemoryAccessPolicyEngine = new MemoryAccessPolicyEngine();
      expect(engine.evaluate).toBeDefined();
      expect(typeof engine.evaluate).toBe('function');
    });

    it('exports PolicyDecisionRecord schema', () => {
      expect(PolicyDecisionRecordSchema).toBeDefined();
      const record: PolicyDecisionRecord = {
        id: '00000000-0000-0000-0000-000000000003',
        projectId: '00000000-0000-0000-0000-000000000001',
        action: 'retrieve',
        outcome: 'denied',
        reasonCode: 'POL-GLOBAL-DENIED',
        reason: 'inheritsGlobal is false',
        occurredAt: new Date().toISOString(),
      };
      expect(PolicyDecisionRecordSchema.safeParse(record).success).toBe(true);
    });

    it('exports PolicyAccessContext and PolicyEvaluationResult schemas', () => {
      expect(PolicyAccessContextSchema).toBeDefined();
      expect(PolicyEvaluationResultSchema).toBeDefined();
    });
  });
});
