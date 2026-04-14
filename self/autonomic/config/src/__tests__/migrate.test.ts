import { describe, it, expect } from 'vitest';
import { migrateSystemConfigModelRoleAssignments } from '../migrate.js';

describe('migrateSystemConfigModelRoleAssignments', () => {
  it('(i) remaps 2-entry legacy to 2-entry canonical', () => {
    const input = {
      modelRoleAssignments: [
        { role: 'reasoner', providerId: 'p1' },
        { role: 'orchestrator', providerId: 'p2' },
      ],
    };
    const result = migrateSystemConfigModelRoleAssignments(input) as any;
    expect(result.modelRoleAssignments).toEqual([
      { role: 'cortex-chat', providerId: 'p1' },
      { role: 'orchestrators', providerId: 'p2' },
    ]);
  });

  it('(ii) silently drops capability-only entries', () => {
    const input = {
      modelRoleAssignments: [
        { role: 'tool-advisor', providerId: 'p1' },
        { role: 'summarizer', providerId: 'p2' },
      ],
    };
    const result = migrateSystemConfigModelRoleAssignments(input) as any;
    expect(result.modelRoleAssignments).toEqual([]);
  });

  it('(iii) mixed legacy → 1-entry remapped', () => {
    const input = {
      modelRoleAssignments: [
        { role: 'reasoner', providerId: 'p1' },
        { role: 'vision', providerId: 'p2' },
      ],
    };
    const result = migrateSystemConfigModelRoleAssignments(input) as any;
    expect(result.modelRoleAssignments).toEqual([
      { role: 'cortex-chat', providerId: 'p1' },
    ]);
  });

  it('(iv) all-7-legacy → exactly 2 remapped survivors', () => {
    const input = {
      modelRoleAssignments: [
        { role: 'reasoner', providerId: 'p1' },
        { role: 'orchestrator', providerId: 'p2' },
        { role: 'tool-advisor', providerId: 'p3' },
        { role: 'summarizer', providerId: 'p4' },
        { role: 'embedder', providerId: 'p5' },
        { role: 'reranker', providerId: 'p6' },
        { role: 'vision', providerId: 'p7' },
      ],
    };
    const result = migrateSystemConfigModelRoleAssignments(input) as any;
    expect(result.modelRoleAssignments).toEqual([
      { role: 'cortex-chat', providerId: 'p1' },
      { role: 'orchestrators', providerId: 'p2' },
    ]);
  });

  it('(v) forward-compat — canonical roles pass through unchanged', () => {
    const input = {
      modelRoleAssignments: [
        { role: 'cortex-chat', providerId: 'p1' },
      ],
    };
    const result = migrateSystemConfigModelRoleAssignments(input) as any;
    expect(result.modelRoleAssignments).toEqual([
      { role: 'cortex-chat', providerId: 'p1' },
    ]);
  });

  it('passes through non-object input unchanged', () => {
    expect(migrateSystemConfigModelRoleAssignments(null)).toBeNull();
    expect(migrateSystemConfigModelRoleAssignments(undefined)).toBeUndefined();
    expect(migrateSystemConfigModelRoleAssignments(42)).toBe(42);
  });

  it('passes through object without modelRoleAssignments unchanged', () => {
    const input = { pfcTier: 3 };
    expect(migrateSystemConfigModelRoleAssignments(input)).toEqual({ pfcTier: 3 });
  });
});
