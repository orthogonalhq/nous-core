import { describe, it, expect } from 'vitest';
import { MemoryAccessPolicyEngine } from '../policy-engine.js';
import {
  DEFAULT_MEMORY_ACCESS_POLICY,
  ProjectIdSchema,
  type PolicyAccessContext,
} from '@nous/shared';

const FROM_ID = ProjectIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
const TARGET_ID = ProjectIdSchema.parse('660e8400-e29b-41d4-a716-446655440001');
const THIRD_ID = ProjectIdSchema.parse('770e8400-e29b-41d4-a716-446655440002');

const engine = new MemoryAccessPolicyEngine();

describe('MemoryAccessPolicyEngine', () => {
  describe('Tier 1 — Contract', () => {
    it('evaluate returns PolicyEvaluationResult', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('reasonCode');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('decisionRecord');
      expect(result.decisionRecord).toHaveProperty('id');
      expect(result.decisionRecord).toHaveProperty('outcome');
      expect(result.decisionRecord).toHaveProperty('occurredAt');
    });
  });

  describe('Tier 2 — Behavior: read', () => {
    it('allows read when both policies are all/all', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
      expect(result.reasonCode).toBe('POL-DEFAULT');
    });

    it('denies read when fromProject canReadFrom is none', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: 'none', canBeReadBy: 'all', inheritsGlobal: true },
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-CANNOT-READ-FROM');
    });

    it('denies read when target canBeReadBy is none', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: { canReadFrom: 'all', canBeReadBy: 'none', inheritsGlobal: true },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-CANNOT-BE-READ-BY');
    });

    it('allows read when both use allowlist and match', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: [TARGET_ID], canBeReadBy: 'all', inheritsGlobal: true },
        targetProjectPolicy: { canReadFrom: 'all', canBeReadBy: [FROM_ID], inheritsGlobal: true },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });

    it('denies read when fromProject allowlist excludes target', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: [THIRD_ID], canBeReadBy: 'all', inheritsGlobal: true },
        targetProjectPolicy: { canReadFrom: 'all', canBeReadBy: [FROM_ID], inheritsGlobal: true },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-CANNOT-READ-FROM');
    });
  });

  describe('Tier 2 — Behavior: retrieve', () => {
    it('allows retrieve with global when inheritsGlobal true', () => {
      const ctx = {
        action: 'retrieve' as const,
        fromProjectId: FROM_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });

    it('denies retrieve global when inheritsGlobal false', () => {
      const ctx: PolicyAccessContext = {
        action: 'retrieve',
        fromProjectId: FROM_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: 'all', canBeReadBy: 'all', inheritsGlobal: false },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-GLOBAL-DENIED');
    });

    it('allows retrieve with targetProjectIds when policies allow', () => {
      const ctx = {
        action: 'retrieve' as const,
        fromProjectId: FROM_ID,
        targetProjectIds: [TARGET_ID],
        includeGlobal: false,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicies: { [TARGET_ID]: DEFAULT_MEMORY_ACCESS_POLICY },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Tier 2 — Behavior: node override', () => {
    it('allows when node override is more restrictive', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        nodeOverride: { canReadFrom: 'none' as const },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-CANNOT-READ-FROM');
    });

    it('denies when node override relaxes (not more restrictive)', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: 'none', canBeReadBy: 'all', inheritsGlobal: true },
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        nodeOverride: { canReadFrom: 'all' },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-INVALID-OVERRIDE');
    });

    it('applies node override inheritsGlobal false', () => {
      const ctx = {
        action: 'retrieve' as const,
        fromProjectId: FROM_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        nodeOverride: { inheritsGlobal: false },
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-GLOBAL-DENIED');
    });
  });

  describe('Tier 2 — Behavior: control state', () => {
    it('denies when hard_stopped', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        projectControlState: 'hard_stopped' as const,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reasonCode).toBe('POL-CONTROL-STATE-BLOCKED');
    });
  });

  describe('Tier 2 — Action-specific validation', () => {
    it('throws when read missing targetProjectId', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      expect(() => engine.evaluate(ctx)).toThrow(/targetProjectId/);
    });

    it('throws when read missing targetProjectPolicy', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      expect(() => engine.evaluate(ctx)).toThrow(/targetProjectPolicy/);
    });

    it('allows retrieve with includeGlobal only (no targets)', () => {
      const ctx = {
        action: 'retrieve' as const,
        fromProjectId: FROM_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Tier 3 — Replay determinism', () => {
    it('identical inputs produce identical allowed and reasonCode', () => {
      const ctx = {
        action: 'read' as const,
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const r1 = engine.evaluate(ctx);
      const r2 = engine.evaluate(ctx);
      expect(r1.allowed).toBe(r2.allowed);
      expect(r1.reasonCode).toBe(r2.reasonCode);
    });

    it('deny path produces deterministic reasonCode', () => {
      const ctx: PolicyAccessContext = {
        action: 'read',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: { canReadFrom: 'none', canBeReadBy: 'all', inheritsGlobal: true },
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const r1 = engine.evaluate(ctx);
      const r2 = engine.evaluate(ctx);
      expect(r1.allowed).toBe(false);
      expect(r2.allowed).toBe(false);
      expect(r1.reasonCode).toBe('POL-CANNOT-READ-FROM');
      expect(r2.reasonCode).toBe('POL-CANNOT-READ-FROM');
    });
  });

  describe('Tier 3 — Write (same as read)', () => {
    it('allows write when policies allow', () => {
      const ctx: PolicyAccessContext = {
        action: 'write',
        fromProjectId: FROM_ID,
        targetProjectId: TARGET_ID,
        includeGlobal: true,
        projectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
        targetProjectPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
      };
      const result = engine.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });
  });
});
