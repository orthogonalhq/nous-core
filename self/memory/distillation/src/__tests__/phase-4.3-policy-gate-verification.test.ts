/**
 * Phase 4.3 policy-gate verification.
 * Distillation writes invoke policy gate when cross-project; no bypass.
 *
 * Contract: Caller MUST invoke policy evaluation before distillation writes
 * when scope is cross-project or global. DistillationEngine writes directly
 * to the provided LTM - no built-in policy bypass. For cross-project scope
 * (future), caller must pass a policy-enforced LTM or invoke policy before write.
 */
import { describe, expect, it, vi } from 'vitest';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import { DistillationEngine } from '../distillation-engine.js';
import {
  NOW,
  PROJECT_ID,
  makeStablePromotionCluster,
} from './fixtures/production-scenarios.js';

describe('Phase 4.3 policy-gate verification', () => {
  it('runDistillationPass produces project-scoped patterns only', async () => {
    const ltm = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster();
    for (const record of cluster.records) {
      await ltm.write(record);
    }

    const engine = new DistillationEngine(ltm, {
      now: () => NOW,
    });
    const result = await engine.runDistillationPass(PROJECT_ID);

    expect(result.patternsCreated.length).toBe(1);
    for (const pattern of result.patternsCreated) {
      expect(pattern.scope).toBe('project');
      expect(pattern.projectId).toBe(PROJECT_ID);
    }
  });

  it('writes go through the provided LTM with no built-in bypass path', async () => {
    const ltm = new InMemoryLtmStore();
    const cluster = makeStablePromotionCluster();
    for (const record of cluster.records) {
      await ltm.write(record);
    }
    const writeSpy = vi.spyOn(ltm, 'write');
    writeSpy.mockClear();

    const engine = new DistillationEngine(ltm, {
      now: () => NOW,
    });
    await engine.runDistillationPass(PROJECT_ID);

    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
