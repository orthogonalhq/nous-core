/**
 * Phase 4.3 policy-gate verification.
 * Distillation writes invoke policy gate when cross-project; no bypass.
 *
 * Contract: Caller MUST invoke policy evaluation before distillation writes
 * when scope is cross-project or global. DistillationEngine writes directly
 * to the provided LTM — no built-in policy bypass. For cross-project scope
 * (future), caller must pass a policy-enforced LTM or invoke policy before write.
 */
import { describe, it, expect, vi } from 'vitest';
import { DistillationEngine } from '../distillation-engine.js';
import { InMemoryLtmStore } from '@nous/memory-stubs';
import type { ExperienceRecord } from '@nous/shared';
import { ExperienceRecordSchema } from '@nous/shared';

const NOW = new Date().toISOString();
const PROJ = '550e8400-e29b-41d4-a716-446655440000';
const TRACE = '550e8400-e29b-41d4-a716-446655440001';

function makeRecord(id: string): ExperienceRecord {
  return ExperienceRecordSchema.parse({
    id,
    content: 'ctx',
    type: 'experience-record',
    scope: 'project',
    projectId: PROJ,
    confidence: 0.8,
    sensitivity: [],
    retention: 'permanent',
    provenance: { traceId: TRACE, source: 'test', timestamp: NOW },
    tags: ['tag1'],
    sentiment: 'strong-positive',
    context: 'ctx',
    action: 'act',
    outcome: 'out',
    reason: 'reason',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('Phase 4.3 policy-gate verification', () => {
  it('runDistillationPass produces project-scoped patterns only', async () => {
    const ltm = new InMemoryLtmStore();
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440010'));
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440011'));
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440012'));

    const engine = new DistillationEngine(ltm, {
      clusterConfig: { minClusterSize: 2, maxClusterSize: 10, clusteringStrategy: 'project' },
    });
    const result = await engine.runDistillationPass(PROJ);

    expect(result.patternsCreated.length).toBeGreaterThan(0);
    for (const p of result.patternsCreated) {
      expect(p.scope).toBe('project');
      expect(p.projectId).toBe(PROJ);
    }
  });

  it('writes go through provided LTM — no built-in bypass', async () => {
    const ltm = new InMemoryLtmStore();
    const writeSpy = vi.spyOn(ltm, 'write');
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440010'));
    await ltm.write(makeRecord('550e8400-e29b-41d4-a716-446655440011'));
    writeSpy.mockClear();

    const engine = new DistillationEngine(ltm, {
      clusterConfig: { minClusterSize: 2, maxClusterSize: 10, clusteringStrategy: 'project' },
    });
    await engine.runDistillationPass(PROJ);

    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
