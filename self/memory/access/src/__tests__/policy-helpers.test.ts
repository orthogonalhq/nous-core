/**
 * Policy helpers unit tests.
 */
import { describe, it, expect } from 'vitest';
import {
  isCrossProjectMemoryWrite,
  buildPolicyAccessContextForMemoryWrite,
} from '../policy-helpers.js';
import { DEFAULT_MEMORY_ACCESS_POLICY } from '@nous/shared';
import type { MemoryWriteCandidate, ProjectConfig, ProjectId } from '@nous/shared';

const ACTING_ID = '660e8400-e29b-41d4-a716-446655440000' as ProjectId;
const TARGET_ID = '660e8400-e29b-41d4-a716-446655440001' as ProjectId;

function createCandidate(overrides: Partial<MemoryWriteCandidate>): MemoryWriteCandidate {
  return {
    content: 'test',
    type: 'fact',
    scope: 'project',
    confidence: 0.9,
    sensitivity: [],
    retention: 'permanent',
    provenance: {
      traceId: 'trace-1' as any,
      source: 'test',
      timestamp: new Date().toISOString(),
    },
    tags: [],
    ...overrides,
  };
}

function createProjectConfig(id: ProjectId): ProjectConfig {
  return {
    id,
    name: 'Test Project',
    type: 'protocol',
    pfcTier: 0,
    memoryAccessPolicy: DEFAULT_MEMORY_ACCESS_POLICY,
    escalationChannels: [],
    retrievalBudgetTokens: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('isCrossProjectMemoryWrite', () => {
  it('returns true when scope is global', () => {
    const candidate = createCandidate({ scope: 'global' });
    expect(isCrossProjectMemoryWrite(candidate, ACTING_ID)).toBe(true);
    expect(isCrossProjectMemoryWrite(candidate, undefined)).toBe(true);
  });

  it('returns true when candidate.projectId differs from actingProjectId', () => {
    const candidate = createCandidate({
      scope: 'project',
      projectId: TARGET_ID,
    });
    expect(isCrossProjectMemoryWrite(candidate, ACTING_ID)).toBe(true);
  });

  it('returns false when scope is project and projectId matches acting', () => {
    const candidate = createCandidate({
      scope: 'project',
      projectId: ACTING_ID,
    });
    expect(isCrossProjectMemoryWrite(candidate, ACTING_ID)).toBe(false);
  });

  it('returns false when scope is project and projectId is absent', () => {
    const candidate = createCandidate({ scope: 'project' });
    expect(isCrossProjectMemoryWrite(candidate, ACTING_ID)).toBe(false);
  });

  it('returns false when actingProjectId is undefined and scope is project', () => {
    const candidate = createCandidate({
      scope: 'project',
      projectId: TARGET_ID,
    });
    expect(isCrossProjectMemoryWrite(candidate, undefined)).toBe(false);
  });
});

describe('buildPolicyAccessContextForMemoryWrite', () => {
  it('returns null when actingProjectConfig is null', () => {
    const candidate = createCandidate({ scope: 'global' });
    const result = buildPolicyAccessContextForMemoryWrite({
      candidate,
      actingProjectId: ACTING_ID,
      actingProjectConfig: null,
      projectControlState: 'running',
    });
    expect(result).toBeNull();
  });

  it('builds write context for global scope', () => {
    const candidate = createCandidate({ scope: 'global' });
    const actingConfig = createProjectConfig(ACTING_ID);
    const result = buildPolicyAccessContextForMemoryWrite({
      candidate,
      actingProjectId: ACTING_ID,
      actingProjectConfig: actingConfig,
      projectControlState: 'running',
      traceId: 'trace-1' as any,
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe('write');
    expect(result!.includeGlobal).toBe(true);
    expect(result!.fromProjectId).toBe(ACTING_ID);
    expect(result!.projectPolicy).toEqual(DEFAULT_MEMORY_ACCESS_POLICY);
    expect(result!.targetProjectId).toBeUndefined();
  });

  it('builds write context when candidate targets different project', () => {
    const candidate = createCandidate({
      scope: 'project',
      projectId: TARGET_ID,
    });
    const actingConfig = createProjectConfig(ACTING_ID);
    const targetConfig = createProjectConfig(TARGET_ID);
    const result = buildPolicyAccessContextForMemoryWrite({
      candidate,
      actingProjectId: ACTING_ID,
      actingProjectConfig: actingConfig,
      targetProjectConfig: targetConfig,
      projectControlState: 'running',
    });
    expect(result).not.toBeNull();
    expect(result!.action).toBe('write');
    expect(result!.targetProjectId).toBe(TARGET_ID);
    expect(result!.targetProjectPolicy).toEqual(DEFAULT_MEMORY_ACCESS_POLICY);
    expect(result!.fromProjectId).toBe(ACTING_ID);
  });

  it('returns null when targetProjectConfig is missing for cross-project write', () => {
    const candidate = createCandidate({
      scope: 'project',
      projectId: TARGET_ID,
    });
    const actingConfig = createProjectConfig(ACTING_ID);
    const result = buildPolicyAccessContextForMemoryWrite({
      candidate,
      actingProjectId: ACTING_ID,
      actingProjectConfig: actingConfig,
      targetProjectConfig: null,
    });
    expect(result).toBeNull();
  });
});
